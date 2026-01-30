# SNOMED CT Terminology Browser

A professional, modern web application for browsing SNOMED CT terminology. Built as a single-page application that can be hosted on GitHub Pages or any static hosting service.

![SNOMED CT Browser](https://img.shields.io/badge/SNOMED%20CT-Browser-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

### 🔍 **Search & Browse**
- Full-text search across SNOMED CT concepts
- Search by term or SCTID (concept ID)
- Semantic tag filtering (disorder, finding, procedure, etc.)
- Support for multiple code systems (International, German Extension, LOINC)

### 🌳 **Hierarchy Navigation**
- View parent concepts (Is-A relationships)
- View child concepts (subtypes)
- Load all ancestors with one click
- Count descendants

### 📋 **Concept Details**
- Fully Specified Name (FSN) and Preferred Term (PT)
- Definition status (Primitive/Fully Defined)
- All descriptions with language and acceptability
- Stated and inferred relationships
- Module information

### 🗺️ **Mappings**
- View ICD-10 mappings
- Other reference set memberships
- Map groups and priorities

### 💾 **User Features**
- Search history
- Bookmark favorite concepts
- Export bookmarks as JSON
- Dark mode support
- Keyboard shortcuts

## Deployment Guide

### Option 1: GitHub Pages (Recommended)

#### Step 1: Create GitHub Repository

1. Go to [github.com](https://github.com) and create a new repository
2. Name it `snomed-browser` (or any name you prefer)
3. Make it **Public** (required for free GitHub Pages)
4. Initialize with a README

#### Step 2: Upload Files

Upload these files to your repository:
- `index.html`
- `styles.css`
- `app.js`

You can do this via:
- GitHub web interface (drag and drop)
- Git command line
- GitHub Desktop

#### Step 3: Enable GitHub Pages

1. Go to your repository's **Settings**
2. Navigate to **Pages** in the sidebar
3. Under "Source", select **Deploy from a branch**
4. Select **main** branch and **/ (root)** folder
5. Click **Save**

Your site will be available at: `https://YOUR_USERNAME.github.io/snomed-browser/`

#### Step 4: Set Up Cloudflare Worker (CORS Proxy)

Since your terminology server is HTTP and doesn't have CORS headers, you need a proxy:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Sign up for a free account if you don't have one
3. Click **Workers & Pages** in the sidebar
4. Click **Create application** → **Create Worker**
5. Name it `snomed-proxy`
6. Click **Deploy**
7. Click **Edit code**
8. Delete the default code and paste the contents of `cloudflare-worker.js`
9. Click **Save and Deploy**

Your worker URL will be: `https://snomed-proxy.YOUR_SUBDOMAIN.workers.dev`

#### Step 5: Configure the App

Update `app.js` line ~27 to use your Cloudflare Worker URL:

```javascript
apiUrl: 'https://snomed-proxy.YOUR_SUBDOMAIN.workers.dev',
```

Commit and push this change to GitHub.

### Option 2: Netlify

1. Go to [netlify.com](https://netlify.com)
2. Sign up and click "Add new site" → "Import an existing project"
3. Connect your GitHub repository
4. Deploy settings: leave defaults
5. Click "Deploy"

For the CORS proxy, you can also use Netlify Functions instead of Cloudflare Workers.

### Option 3: Vercel

1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repository
3. Deploy with default settings

### Option 4: Local Testing

For local development/testing:

```bash
# Option A: Use Python's built-in server
cd webapp
python -m http.server 8080

# Option B: Use Node.js http-server
npx http-server -p 8080

# Option C: Use the included proxy.js (original method)
node proxy.js
# Then update app.js apiUrl to: 'http://localhost:3000'
```

## Configuration

### Changing the Terminology Server

If you have a different Snowstorm server, update the `TARGET_SERVER` in `cloudflare-worker.js`:

```javascript
const TARGET_SERVER = 'http://your-server:8080';
```

### Available Code Systems

The browser automatically detects available code systems from the server:

| Code System | Description |
|-------------|-------------|
| SNOMEDCT | SNOMED CT International Edition |
| SNOMEDCT-DE | German National Extension |
| SNOMEDCT-LOINC | LOINC Extension |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Execute search |
| `Esc` | Close detail panel / modals |
| `Ctrl+K` | Focus search box |

## API Endpoints Used

The browser uses the Snowstorm API:

| Endpoint | Description |
|----------|-------------|
| `GET /codesystems` | List available code systems |
| `GET /{branch}/concepts` | Search concepts |
| `GET /{branch}/concepts/{id}` | Get concept details |
| `GET /{branch}/concepts/{id}/parents` | Get parent concepts |
| `GET /{branch}/concepts/{id}/children` | Get child concepts |
| `GET /{branch}/concepts/{id}/ancestors` | Get all ancestors |
| `GET /{branch}/concepts/{id}/descriptions` | Get descriptions |
| `GET /{branch}/concepts/{id}/relationships` | Get relationships |
| `GET /{branch}/members` | Get refset members / mappings |

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Troubleshooting

### "Connection failed" error

1. Verify your Cloudflare Worker is deployed and running
2. Check the Worker URL in your app.js configuration
3. Test the worker directly: `https://your-worker.workers.dev/codesystems`

### No search results

1. Ensure you've selected a code system
2. Check if the term exists in SNOMED CT
3. Try searching by SCTID instead

### CORS errors in console

This usually means the Cloudflare Worker isn't set up correctly or the apiUrl hasn't been updated.

### Slow performance

1. The terminology server might be under load
2. Try reducing the result limit in filters
3. Check your internet connection

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this for any purpose.

## Credits

- Built with [Vue.js 3](https://vuejs.org/)
- Styled with [Bootstrap 5](https://getbootstrap.com/)
- Icons from [Bootstrap Icons](https://icons.getbootstrap.com/)
- Powered by [Snowstorm](https://github.com/IHTSDO/snowstorm) Terminology Server

## Support

For issues with:
- **This browser application**: Open a GitHub issue
- **SNOMED CT content**: Contact [SNOMED International](https://www.snomed.org/)
- **Snowstorm server**: See [Snowstorm documentation](https://github.com/IHTSDO/snowstorm)
