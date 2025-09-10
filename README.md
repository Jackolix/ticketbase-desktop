# Ticket System Desktop

A modern, cross-platform desktop application for ticket management built with Tauri, React, and TypeScript.

## ✨ Features

- 🎫 **Complete Ticket Management** - View, create, and manage support tickets
- ⏱️ **Time Tracking** - Built-in timer for tracking work on tickets
- 📝 **Rich History** - Add detailed work logs and status updates
- 📎 **File Attachments** - Download and view ticket attachments
- 🔍 **Smart Search** - Search tickets by ID, description, company, and more
- 🏢 **Multi-Company Support** - Manage tickets across different companies
- 🔄 **Real-time Sync** - Background updates keep data fresh
- 📱 **Responsive Design** - Works great on any screen size
- 🌙 **Dark Mode** - Built-in theme support

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Rust](https://rustup.rs/) (latest stable)

### Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ticketsystem-desktop
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run tauri dev
   ```

The app will open automatically with hot-reload enabled.

### Building

```bash
# Build for current platform
npm run tauri build

# Build for specific platform (cross-compilation)
npm run tauri build -- --target x86_64-pc-windows-msvc
```

## 📦 Installation

### Download Pre-built Binaries

Visit the [Releases](../../releases) page to download the latest version:

- **Windows**: Download the `.msi` installer or portable `.exe`
- **macOS**: Download the `.dmg` file (Intel or Apple Silicon)
- **Linux**: Download the `.AppImage` or `.deb` package

### Platform-Specific Notes

#### Windows
- The app is currently unsigned, so you may see a SmartScreen warning
- Click "More info" → "Run anyway" to install

#### macOS  
- Right-click the app → "Open" if you see a security warning
- Or go to System Preferences → Security & Privacy to allow

#### Linux
- Make the AppImage executable: `chmod +x app-name.AppImage`
- Or install the .deb package: `sudo dpkg -i app-name.deb`

## 🛠 Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Tauri (Rust)
- **UI Components**: shadcn/ui + Tailwind CSS
- **Icons**: Lucide React
- **State Management**: React Context
- **HTTP Client**: Fetch API

## 🏗 Architecture

- **Frontend**: Modern React with TypeScript and hooks
- **Global State**: Context providers for tickets, auth, and theme
- **Background Sync**: Automatic data updates every 30 seconds
- **Local Caching**: Instant UI with background refresh
- **Type Safety**: Full TypeScript coverage

## 🔧 Configuration

### API Endpoint

The app connects to the ticket system API. Update the base URL in `src/lib/api.ts`:

```typescript
constructor(baseUrl: string = 'https://your-api-domain.com/api') {
  this.baseUrl = baseUrl;
}
```

### Environment Variables

Create a `.env` file in the root directory:

```bash
VITE_API_URL=https://your-api-domain.com/api
VITE_APP_NAME=Your Ticket System
```

## 🚀 Deployment

### Automated Builds (GitHub Actions)

The project includes GitHub Actions workflows for automated building:

- **Production builds**: Triggered on releases, creates signed installers
- **Development builds**: Triggered on feature branches, creates unsigned builds

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed setup instructions.

### Manual Deployment

1. Build the application: `npm run tauri build`
2. Find built files in `src-tauri/target/release/bundle/`
3. Distribute the appropriate installer for each platform

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📋 Development Setup

### Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

### Useful Commands

```bash
# Start development server
npm run tauri dev

# Build for production
npm run tauri build

# Run frontend only (for UI development)
npm run dev

# Type checking
npm run type-check

# Lint code
npm run lint

# Generate Tauri icons
npm run tauri icon
```

## 🐛 Troubleshooting

### Common Issues

**Build fails on first run:**
- Ensure Rust is properly installed: `rustc --version`
- Install platform dependencies (see Tauri documentation)

**API connection issues:**
- Check the API base URL in `src/lib/api.ts`
- Verify the backend API is running and accessible
- Check browser console for CORS or network errors

**Authentication problems:**
- Clear browser storage: localStorage and sessionStorage
- Check token expiration and refresh logic

### Debug Mode

Run in debug mode for additional logging:
```bash
npm run tauri dev -- --debug
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Tauri](https://tauri.app/) - Thanks to the Tauri team for an amazing framework
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Icons by [Lucide](https://lucide.dev/)
