/**
 * SNOMED CT Terminology Browser
 * Professional Healthcare Terminology Explorer
 * 
 * Features:
 * - Concept search with filters
 * - Hierarchy navigation (parents/children/ancestors)
 * - Descriptions and relationships viewing
 * - Mappings to other code systems (ICD-10, etc.)
 * - Reference set membership
 * - Bookmarks and search history
 * - Dark mode support
 */

const { createApp } = Vue;

const app = createApp({
    data() {
        return {
            // Configuration
            config: {
                // IMPORTANT: Update this URL to your Cloudflare Worker URL after deployment
                // For local testing with proxy: 'http://localhost:3000'
                // For production with Cloudflare Worker: 'https://your-worker.workers.dev'
                apiUrl: 'http://84.8.248.255:8080',  // LOCAL TESTING - change to Cloudflare Worker URL for production
                showInactive: false,
                darkMode: false,
                compactView: false
            },

            // Connection state
            isConnected: false,

            // Code systems
            codeSystems: [],
            selectedBranch: '',

            // Search
            searchQuery: '',
            filters: {
                activeOnly: true,
                limit: 50,
                semanticTag: ''
            },
            searchSuggestions: ['diabetes', 'pneumonia', 'fracture', 'hypertension'],

            // Results
            results: [],
            totalResults: 0,
            hasMoreResults: false,
            currentOffset: 0,
            hasSearched: false,

            // Selected concept
            selectedConcept: null,
            selectedConceptDetails: null,
            activeTab: 'overview',

            // Hierarchy
            parents: null,
            children: null,
            ancestors: [],
            descendantsCount: null,
            parentsLoading: false,
            childrenLoading: false,
            ancestorsLoading: false,

            // Descriptions & Relationships
            descriptions: [],
            descriptionsLoading: false,
            relationships: [],
            relationshipsLoading: false,
            relationshipFilter: 'all',

            // Mappings & Refsets
            mappings: [],
            mappingsLoading: false,
            mappingsLoaded: false,
            refsets: [],
            refsetsLoading: false,
            refsetsLoaded: false,

            // UI State
            loading: false,
            loadingMessage: 'Loading...',
            showSettings: false,
            showHelp: false,
            showHistory: false,
            showBookmarks: false,

            // History & Bookmarks
            searchHistory: [],
            bookmarks: [],

            // Toast notifications
            toasts: [],
            toastId: 0,

            // Module names cache
            moduleNames: {
                '900000000000012004': 'Model Component',
                '900000000000207008': 'SNOMED CT Core',
                '449080006': 'ICD-10 Mapping',
                '11000274103': 'Germany Extension',
                '11010000107': 'LOINC Extension'
            }
        };
    },

    computed: {
        filteredRelationships() {
            if (this.relationshipFilter === 'all') {
                return this.relationships;
            }
            return this.relationships.filter(rel => {
                if (this.relationshipFilter === 'stated') {
                    return rel.characteristicType === 'STATED_RELATIONSHIP';
                }
                return rel.characteristicType !== 'STATED_RELATIONSHIP';
            });
        }
    },

    mounted() {
        // Load saved configuration
        this.loadConfig();
        
        // Load history and bookmarks
        this.loadHistory();
        this.loadBookmarks();
        
        // Apply dark mode if saved
        if (this.config.darkMode) {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
        
        // Initialize
        this.fetchCodeSystems();

        // Keyboard shortcuts
        document.addEventListener('keydown', this.handleKeyboard);
    },

    beforeUnmount() {
        document.removeEventListener('keydown', this.handleKeyboard);
    },

    methods: {
        // ==========================================
        // API Helpers
        // ==========================================

        async apiRequest(endpoint, params = {}) {
            const url = new URL(this.config.apiUrl + endpoint);
            Object.keys(params).forEach(key => {
                if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
                    url.searchParams.append(key, params[key]);
                }
            });
            
            try {
                const response = await fetch(url.toString());
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return await response.json();
            } catch (error) {
                console.error('API Error:', error);
                throw error;
            }
        },

        // ==========================================
        // Code Systems
        // ==========================================

        async fetchCodeSystems() {
            this.loading = true;
            this.loadingMessage = 'Loading code systems...';
            
            try {
                const response = await this.apiRequest('/codesystems');
                this.codeSystems = response.items.map(sys => ({
                    label: sys.shortName,
                    branchPath: sys.latestVersion ? sys.latestVersion.branchPath : sys.branchPath,
                    version: sys.latestVersion ? sys.latestVersion.version : 'HEAD',
                    languages: sys.languages ? Object.values(sys.languages).join(', ') : ''
                }));

                // Default to German extension if available, otherwise first one
                const defaultSystem = this.codeSystems.find(c => c.label === 'SNOMEDCT-DE') 
                    || this.codeSystems[0];
                if (defaultSystem) {
                    this.selectedBranch = defaultSystem.branchPath;
                }

                this.isConnected = true;
                this.showToast('Connected to terminology server', 'success', 'bi-check-circle');
            } catch (error) {
                this.isConnected = false;
                this.showToast('Connection failed: ' + error.message, 'danger', 'bi-exclamation-circle');
            } finally {
                this.loading = false;
            }
        },

        onCodeSystemChange() {
            // Clear results when changing code system
            this.results = [];
            this.hasSearched = false;
            this.selectedConcept = null;
            this.selectedConceptDetails = null;
        },

        // ==========================================
        // Search
        // ==========================================

        async search() {
            if (!this.searchQuery.trim()) return;
            if (!this.selectedBranch) {
                this.showToast('Please select a code system first', 'warning', 'bi-exclamation-triangle');
                return;
            }

            this.loading = true;
            this.loadingMessage = 'Searching...';
            this.hasSearched = true;
            this.currentOffset = 0;
            // Don't clear selected concept - user might want to keep viewing it

            try {
                const params = {
                    limit: this.filters.limit,
                    activeFilter: this.filters.activeOnly,
                    offset: 0,
                    expand: 'fsn(),pt()'
                };

                // Check if search query is a SCTID (all digits)
                if (/^\d+$/.test(this.searchQuery.trim())) {
                    params.conceptIds = this.searchQuery.trim();
                } else {
                    params.term = this.searchQuery;
                    // Use ECL for semantic tag filtering
                    if (this.filters.semanticTag) {
                        // Semantic tags map to specific top-level hierarchies
                        const semanticTagEcl = {
                            'disorder': '<< 64572001',  // Disease/disorder
                            'finding': '(<< 404684003) MINUS (<< 64572001)',  // Clinical finding MINUS disorders
                            'procedure': '<< 71388002',  // Procedure
                            'body structure': '<< 123037004',  // Body structure
                            'substance': '<< 105590001',  // Substance
                            'product': '<< 373873005',  // Pharmaceutical / biologic product
                            'organism': '<< 410607006',  // Organism
                            'observable entity': '<< 363787002'  // Observable entity
                        };
                        if (semanticTagEcl[this.filters.semanticTag]) {
                            params.ecl = semanticTagEcl[this.filters.semanticTag];
                        }
                    }
                }

                const response = await this.apiRequest(`/${this.selectedBranch}/concepts`, params);
                this.results = response.items || [];
                this.totalResults = response.total || this.results.length;
                this.hasMoreResults = this.results.length < this.totalResults;

                // Add to history
                this.addToHistory(this.searchQuery);

            } catch (error) {
                this.showToast('Search failed: ' + error.message, 'danger', 'bi-exclamation-circle');
                this.results = [];
            } finally {
                this.loading = false;
            }
        },

        async loadMore() {
            if (!this.hasMoreResults) return;

            this.loading = true;
            this.loadingMessage = 'Loading more results...';
            this.currentOffset += this.filters.limit;

            try {
                const params = {
                    term: this.searchQuery,
                    limit: this.filters.limit,
                    activeFilter: this.filters.activeOnly,
                    offset: this.currentOffset,
                    expand: 'fsn(),pt()'
                };

                // Use ECL for semantic tag filtering
                if (this.filters.semanticTag) {
                    const semanticTagEcl = {
                        'disorder': '<< 64572001',
                        'finding': '(<< 404684003) MINUS (<< 64572001)',
                        'procedure': '<< 71388002',
                        'body structure': '<< 123037004',
                        'substance': '<< 105590001',
                        'product': '<< 373873005',
                        'organism': '<< 410607006',
                        'observable entity': '<< 363787002'
                    };
                    if (semanticTagEcl[this.filters.semanticTag]) {
                        params.ecl = semanticTagEcl[this.filters.semanticTag];
                    }
                }

                const response = await this.apiRequest(`/${this.selectedBranch}/concepts`, params);
                const newItems = response.items || [];
                this.results = [...this.results, ...newItems];
                this.hasMoreResults = this.results.length < this.totalResults;
            } catch (error) {
                this.showToast('Failed to load more results', 'danger', 'bi-exclamation-circle');
            } finally {
                this.loading = false;
            }
        },

        quickSearch(term) {
            this.searchQuery = term;
            this.search();
        },

        onSearchInput() {
            // Could implement autocomplete here
        },

        // ==========================================
        // Concept Loading
        // ==========================================

        async selectConcept(concept) {
            this.loadConcept(concept.conceptId);
        },

        async loadConcept(conceptId) {
            this.loading = true;
            this.loadingMessage = 'Loading concept details...';
            this.selectedConcept = conceptId;

            // Reset all concept-specific data
            this.parents = null;
            this.children = null;
            this.ancestors = [];
            this.descendantsCount = null;
            this.descriptions = [];
            this.relationships = [];
            this.mappings = [];
            this.mappingsLoaded = false;
            this.refsets = [];
            this.refsetsLoaded = false;
            this.activeTab = 'overview';

            try {
                // Try browser endpoint first for richer data
                let response;
                try {
                    response = await this.apiRequest(
                        `/browser/${this.selectedBranch}/concepts/${conceptId}`
                    );
                } catch (e) {
                    // Fallback to standard endpoint
                    response = await this.apiRequest(
                        `/${this.selectedBranch}/concepts/${conceptId}`,
                        { expand: 'fsn(),pt()' }
                    );
                }
                this.selectedConceptDetails = response;
                
                // If browser endpoint returned descriptions/relationships, store them
                if (response.descriptions) {
                    this.descriptions = response.descriptions;
                }
                if (response.relationships) {
                    this.relationships = response.relationships;
                } else if (response.classAxioms) {
                    // Extract from OWL axioms
                    const rels = [];
                    response.classAxioms.forEach(axiom => {
                        if (axiom.relationships) rels.push(...axiom.relationships);
                    });
                    this.relationships = rels;
                }
            } catch (error) {
                this.showToast('Failed to load concept: ' + error.message, 'danger', 'bi-exclamation-circle');
                this.selectedConcept = null;
            } finally {
                this.loading = false;
            }
        },

        closeConcept() {
            this.selectedConcept = null;
            this.selectedConceptDetails = null;
        },

        // ==========================================
        // Hierarchy
        // ==========================================

        async fetchParents() {
            if (!this.selectedConcept) return;
            this.parentsLoading = true;

            try {
                // Use ECL: >! ID means "Get immediate parents of ID"
                const response = await this.apiRequest(
                    `/${this.selectedBranch}/concepts`,
                    { ecl: `>! ${this.selectedConcept}`, limit: 50, expand: 'fsn(),pt()' }
                );
                this.parents = response.items || [];
            } catch (error) {
                this.showToast('Failed to load parents', 'danger', 'bi-exclamation-circle');
                this.parents = [];
            } finally {
                this.parentsLoading = false;
            }
        },

        async fetchChildren() {
            if (!this.selectedConcept) return;
            this.childrenLoading = true;

            try {
                // Use ECL: <! ID means "Get immediate children of ID"
                const response = await this.apiRequest(
                    `/${this.selectedBranch}/concepts`,
                    { ecl: `<! ${this.selectedConcept}`, limit: 50, expand: 'fsn(),pt()' }
                );
                this.children = response.items || [];
            } catch (error) {
                this.showToast('Failed to load children', 'danger', 'bi-exclamation-circle');
                this.children = [];
            } finally {
                this.childrenLoading = false;
            }
        },

        async fetchAncestors() {
            if (!this.selectedConcept) return;
            this.ancestorsLoading = true;
            this.loading = true;
            this.loadingMessage = 'Loading ancestors...';

            try {
                // Use ECL: >> ID means "Get all ancestors of ID"
                const response = await this.apiRequest(
                    `/${this.selectedBranch}/concepts`,
                    { ecl: `>> ${this.selectedConcept}`, limit: 100, expand: 'fsn(),pt()' }
                );
                this.ancestors = response.items || [];
            } catch (error) {
                this.showToast('Failed to load ancestors', 'danger', 'bi-exclamation-circle');
            } finally {
                this.ancestorsLoading = false;
                this.loading = false;
            }
        },

        async fetchDescendantsCount() {
            if (!this.selectedConcept) return;
            this.loading = true;
            this.loadingMessage = 'Counting descendants...';

            try {
                // Search for descendants with limit 1 to get total count
                const response = await this.apiRequest(
                    `/${this.selectedBranch}/concepts`,
                    { 
                        ecl: `<${this.selectedConcept}`,
                        limit: 1,
                        activeFilter: true
                    }
                );
                this.descendantsCount = response.total || 0;
                this.showToast(`Found ${this.descendantsCount} descendants`, 'info', 'bi-info-circle');
            } catch (error) {
                this.showToast('Failed to count descendants', 'danger', 'bi-exclamation-circle');
            } finally {
                this.loading = false;
            }
        },

        async browseRoot() {
            // Load the root concept (SNOMED CT Concept)
            this.searchQuery = '138875005';
            await this.search();
            if (this.results.length > 0) {
                this.selectConcept(this.results[0]);
            }
        },

        // ==========================================
        // Descriptions
        // ==========================================

        async fetchDescriptions() {
            if (!this.selectedConcept) return;
            if (this.descriptions.length > 0) return; // Already loaded
            this.descriptionsLoading = true;

            try {
                // Try browser endpoint first - it returns full concept with descriptions
                const response = await this.apiRequest(
                    `/browser/${this.selectedBranch}/concepts/${this.selectedConcept}`
                );
                
                if (response.descriptions && response.descriptions.length > 0) {
                    this.descriptions = response.descriptions;
                } else {
                    // Fallback: expand parameter
                    const expandResponse = await this.apiRequest(
                        `/${this.selectedBranch}/concepts/${this.selectedConcept}`,
                        { expand: 'descriptions()' }
                    );
                    this.descriptions = expandResponse.descriptions || [];
                }
            } catch (error) {
                console.error('Descriptions error:', error);
                // Final fallback - descriptions search
                try {
                    const descResponse = await this.apiRequest(
                        `/${this.selectedBranch}/descriptions`,
                        { concept: this.selectedConcept, limit: 100 }
                    );
                    this.descriptions = descResponse.items || [];
                } catch (e) {
                    this.descriptions = [];
                }
            } finally {
                this.descriptionsLoading = false;
            }
        },

        getDescriptionTypeBadge(type) {
            switch (type) {
                case 'FSN': return 'desc-fsn bg-primary';
                case 'SYNONYM': return 'desc-synonym bg-info';
                case 'DEFINITION': return 'desc-definition bg-secondary';
                default: return 'bg-secondary';
            }
        },

        // ==========================================
        // Relationships
        // ==========================================

        async fetchRelationships() {
            if (!this.selectedConcept) return;
            if (this.relationships.length > 0) return; // Already loaded
            this.relationshipsLoading = true;

            try {
                // Try browser endpoint first - it returns full concept with relationships
                const response = await this.apiRequest(
                    `/browser/${this.selectedBranch}/concepts/${this.selectedConcept}`
                );
                
                if (response.relationships && response.relationships.length > 0) {
                    this.relationships = response.relationships;
                } else if (response.classAxioms || response.gciAxioms) {
                    // OWL axiom format - extract relationships
                    const rels = [];
                    if (response.classAxioms) {
                        response.classAxioms.forEach(axiom => {
                            if (axiom.relationships) {
                                rels.push(...axiom.relationships);
                            }
                        });
                    }
                    this.relationships = rels;
                } else {
                    // Fallback: expand parameter
                    const expandResponse = await this.apiRequest(
                        `/${this.selectedBranch}/concepts/${this.selectedConcept}`,
                        { expand: 'relationships()' }
                    );
                    this.relationships = expandResponse.relationships || [];
                }
            } catch (error) {
                console.error('Relationships error:', error);
                this.relationships = [];
            } finally {
                this.relationshipsLoading = false;
            }
        },

        // ==========================================
        // Mappings
        // ==========================================

        async fetchMappings() {
            if (!this.selectedConcept || this.mappingsLoaded) return;
            this.mappingsLoading = true;

            try {
                // Try to fetch from members endpoint (refset members)
                const response = await this.apiRequest(
                    `/${this.selectedBranch}/members`,
                    { 
                        referencedComponentId: this.selectedConcept,
                        active: true,
                        limit: 100
                    }
                );
                
                // Filter for mapping refsets (those that have mapTarget)
                const items = response.items || [];
                this.mappings = items.filter(m => 
                    m.additionalFields?.mapTarget || 
                    m.mapTarget ||
                    (m.refsetId && m.refsetId.includes('map'))
                );
                this.mappingsLoaded = true;
            } catch (error) {
                console.error('Mappings error:', error);
                this.mappings = [];
                this.mappingsLoaded = true;
            } finally {
                this.mappingsLoading = false;
            }
        },

        // ==========================================
        // Reference Sets
        // ==========================================

        async fetchRefsets() {
            if (!this.selectedConcept || this.refsetsLoaded) return;
            this.refsetsLoading = true;

            try {
                const response = await this.apiRequest(
                    `/${this.selectedBranch}/members`,
                    { 
                        referencedComponentId: this.selectedConcept,
                        active: true,
                        limit: 100
                    }
                );
                this.refsets = response.items || [];
                this.refsetsLoaded = true;
            } catch (error) {
                console.error('Refsets error:', error);
                this.refsets = [];
                this.refsetsLoaded = true;
            } finally {
                this.refsetsLoading = false;
            }
        },

        // ==========================================
        // History & Bookmarks
        // ==========================================

        addToHistory(query) {
            if (!query.trim()) return;
            
            // Remove duplicate if exists
            this.searchHistory = this.searchHistory.filter(h => h.query !== query);
            
            // Add to beginning
            this.searchHistory.unshift({
                query: query,
                timestamp: Date.now()
            });
            
            // Keep only last 50
            this.searchHistory = this.searchHistory.slice(0, 50);
            this.saveHistory();
        },

        clearHistory() {
            this.searchHistory = [];
            this.saveHistory();
        },

        saveHistory() {
            localStorage.setItem('termBrowser_history', JSON.stringify(this.searchHistory));
        },

        loadHistory() {
            try {
                const saved = localStorage.getItem('termBrowser_history');
                if (saved) {
                    this.searchHistory = JSON.parse(saved);
                }
            } catch (e) {
                console.error('Failed to load history:', e);
            }
        },

        toggleBookmark(concept) {
            const exists = this.bookmarks.find(b => b.conceptId === concept.conceptId);
            if (exists) {
                this.bookmarks = this.bookmarks.filter(b => b.conceptId !== concept.conceptId);
                this.showToast('Bookmark removed', 'info', 'bi-bookmark');
            } else {
                this.bookmarks.unshift({
                    conceptId: concept.conceptId,
                    term: concept.fsn?.term || concept.pt?.term || concept.conceptId,
                    timestamp: Date.now()
                });
                this.showToast('Bookmark added', 'success', 'bi-bookmark-check');
            }
            this.saveBookmarks();
        },

        isBookmarked(conceptId) {
            return this.bookmarks.some(b => b.conceptId === conceptId);
        },

        clearBookmarks() {
            this.bookmarks = [];
            this.saveBookmarks();
        },

        saveBookmarks() {
            localStorage.setItem('termBrowser_bookmarks', JSON.stringify(this.bookmarks));
        },

        loadBookmarks() {
            try {
                const saved = localStorage.getItem('termBrowser_bookmarks');
                if (saved) {
                    this.bookmarks = JSON.parse(saved);
                }
            } catch (e) {
                console.error('Failed to load bookmarks:', e);
            }
        },

        exportBookmarks() {
            const data = JSON.stringify(this.bookmarks, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'snomed-bookmarks.json';
            a.click();
            URL.revokeObjectURL(url);
        },

        // ==========================================
        // Settings
        // ==========================================

        loadConfig() {
            try {
                const saved = localStorage.getItem('termBrowser_config');
                if (saved) {
                    this.config = { ...this.config, ...JSON.parse(saved) };
                }
            } catch (e) {
                console.error('Failed to load config:', e);
            }
        },

        saveSettings() {
            localStorage.setItem('termBrowser_config', JSON.stringify(this.config));
            this.showToast('Settings saved', 'success', 'bi-check-circle');
            this.showSettings = false;
            
            // Refresh code systems with new API URL
            this.fetchCodeSystems();
        },

        async testConnection() {
            this.loading = true;
            this.loadingMessage = 'Testing connection...';

            try {
                await this.apiRequest('/codesystems');
                this.isConnected = true;
                this.showToast('Connection successful!', 'success', 'bi-check-circle');
            } catch (error) {
                this.isConnected = false;
                this.showToast('Connection failed: ' + error.message, 'danger', 'bi-exclamation-circle');
            } finally {
                this.loading = false;
            }
        },

        toggleDarkMode() {
            if (this.config.darkMode) {
                document.documentElement.setAttribute('data-theme', 'dark');
            } else {
                document.documentElement.removeAttribute('data-theme');
            }
        },

        clearAllData() {
            if (confirm('Are you sure you want to clear all local data? This includes history, bookmarks, and settings.')) {
                localStorage.removeItem('termBrowser_history');
                localStorage.removeItem('termBrowser_bookmarks');
                localStorage.removeItem('termBrowser_config');
                this.searchHistory = [];
                this.bookmarks = [];
                this.showToast('All local data cleared', 'info', 'bi-info-circle');
            }
        },

        // ==========================================
        // Utility Functions
        // ==========================================

        copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
                this.showToast('Copied to clipboard', 'success', 'bi-clipboard-check');
            }).catch(() => {
                this.showToast('Failed to copy', 'danger', 'bi-exclamation-circle');
            });
        },

        copyFSN() {
            if (this.selectedConceptDetails?.fsn?.term) {
                this.copyToClipboard(this.selectedConceptDetails.fsn.term);
            }
        },

        formatTimeAgo(timestamp) {
            const seconds = Math.floor((Date.now() - timestamp) / 1000);
            if (seconds < 60) return 'just now';
            const minutes = Math.floor(seconds / 60);
            if (minutes < 60) return `${minutes}m ago`;
            const hours = Math.floor(minutes / 60);
            if (hours < 24) return `${hours}h ago`;
            const days = Math.floor(hours / 24);
            return `${days}d ago`;
        },

        formatEffectiveTime(effectiveTime) {
            if (!effectiveTime) return 'N/A';
            const str = String(effectiveTime);
            if (str.length === 8) {
                return `${str.substring(0, 4)}-${str.substring(4, 6)}-${str.substring(6, 8)}`;
            }
            return str;
        },

        getModuleName(moduleId) {
            return this.moduleNames[moduleId] || moduleId;
        },

        showToast(message, type = 'info', icon = 'bi-info-circle') {
            const id = ++this.toastId;
            this.toasts.push({ id, message, type, icon });
            setTimeout(() => this.removeToast(id), 4000);
        },

        removeToast(id) {
            this.toasts = this.toasts.filter(t => t.id !== id);
        },

        handleKeyboard(e) {
            // Ctrl+K to focus search
            if (e.ctrlKey && e.key === 'k') {
                e.preventDefault();
                document.querySelector('.search-section input[type="text"]')?.focus();
            }
            // Escape to close modals/panels
            if (e.key === 'Escape') {
                if (this.showSettings) this.showSettings = false;
                else if (this.showHelp) this.showHelp = false;
                else if (this.selectedConcept) this.closeConcept();
            }
        }
    }
});

app.mount('#app');

