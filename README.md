# Soundscaper

**Create immersive soundscapes with AI-powered audio and visual generation**

Soundscaper is a web application that transforms text descriptions into multi-layered audio experiences paired with AI-generated visuals. Describe a scene and it generates appropriate sounds and imagery.

![Soundscaper Preview](public/soundscaper-icon.svg)

## Features

### Intelligent Audio Generation
- **AI-Powered Sound Selection**: Uses OpenAI's GPT models to select appropriate sounds for any scene
- **Multi-Layer Audio**: Creates soundscapes by layering multiple audio sources
- **Freesound Integration**: Access to thousands of royalty-free sounds from Freesound.org
- **Smart Fallback System**: Includes a minimal whitelist for testing purposes when Freesound API is unavailable
- **Audio Management**: Automatic volume balancing and audio mixing

### AI Visual Generation
- **DALL-E 3 Integration**: Generates landscape-format artwork that matches your audio scene
- **Fullscreen Viewer**: Fullscreen image viewing with smooth transitions
- **Cost-Optimized**: Uses landscape format (1792x1024) for better value

### Professional Controls
- **Transport Controls**: Play All, Stop All, and Clear All with color coding
- **Layer Management**: Individual control over each audio layer with volume adjustment
- **Swap Functionality**: Replace individual sounds while maintaining the overall composition
- **Real-time Feedback**: Visual feedback during operations and loading states

### User Experience
- **Design**: Color palette using teal, purple, blue, and orange accents
- **Animations**: Fade-in effects and transitions throughout the interface
- **Layout**: Two-column layout optimized for desktop use
- **Typography**: Clean typography with proper spacing

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn package manager
- OpenAI API key
- Freesound API key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/samtjhia/soundscaper.git
   cd soundscaper
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```env
   VITE_OPENAI_API_KEY=your_openai_api_key_here
   VITE_FREESOUND_API_KEY=your_freesound_api_key_here
   ```

   **Note**: Both API keys are required for full functionality. The Freesound API key provides access to the library of community-contributed sounds necessary for creating diverse soundscapes.

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to `http://localhost:5173` to start creating soundscapes!

### API Keys and Limitations

**OpenAI API Key** (Required):
- Used for intelligent sound selection via GPT models and image generation via DALL-E 3
- Without this key, the application cannot generate soundscapes or images

**Freesound API Key** (Required):
- Provides access to the full Freesound.org library of community sounds
- **Rate Limits**: Free tier allows limited requests per day
- **Fallback System**: A minimal whitelist exists for testing purposes, but the Freesound API is essential for creating quality soundscapes
- **Get Your Key**: Obtain a free Freesound API key at [freesound.org/apiv2/apply](https://freesound.org/apiv2/apply)

**Graceful Degradation**: Soundscaper includes a minimal fallback system for testing, but both API keys are required for the intended user experience.

## Built With

### Core Technologies
- **React 19** - Modern React with latest features
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool and development server

### Styling & UI
- **Tailwind CSS 4** - Utility-first CSS framework
- **Custom Animations** - Fade-in effects and transitions
- **Responsive Design** - Mobile-friendly layouts

### AI & APIs
- **OpenAI API** - GPT models for sound selection and DALL-E 3 for image generation
- **Freesound API** - Access to community-contributed audio samples

### Audio Management
- **Web Audio API** - Browser audio processing and playback
- **IndexedDB Caching** - Audio file caching for improved performance
- **Audio Layering** - Multi-track audio mixing

## Project Structure

```
soundscaper/
├── src/
│   ├── ai/                    # AI service integration
│   │   ├── ai-service.ts      # Main AI orchestration
│   │   ├── llm-service.ts     # OpenAI GPT integration
│   │   ├── prompt-templates.ts # Optimized prompts for sound selection
│   │   └── rules.ts           # Audio generation rules and constraints
│   ├── audio/                 # Audio management
│   │   └── audio-manager.ts   # Audio playback and mixing
│   ├── cache/                 # Performance optimization
│   │   ├── hash.ts            # Content hashing utilities
│   │   └── idb.ts             # IndexedDB caching layer
│   ├── components/            # React components
│   │   ├── add-layer.tsx      # Audio layer addition interface
│   │   ├── layer-list.tsx     # Audio layer management
│   │   └── transport-controls.tsx # Playback controls
│   ├── freesound/             # Freesound API integration
│   │   ├── client.ts          # API client and search functionality
│   │   └── whitelist.ts       # Minimal fallback sounds for testing when API is unavailable
│   ├── hooks/                 # Custom React hooks
│   │   ├── use-audio.ts       # Audio state management
│   │   └── use-layers.ts      # Layer management logic
│   ├── App.tsx                # Main application component
│   ├── main.tsx               # Application entry point
│   └── types.ts               # TypeScript type definitions
├── public/
│   └── soundscaper-icon.svg   # Custom logo and favicon
└── package.json               # Project configuration and dependencies
```

## Usage Examples

### Creating Your First Soundscape

1. **Enter a description** in the text input:
   ```
   "A cozy cabin during a thunderstorm"
   ```

2. **Click Generate** to create your soundscape

3. **Listen and adjust** using the transport controls:
   - **Play All**: Start the complete soundscape
   - **Stop All**: Pause all audio layers
   - **Clear All**: Remove all layers and start fresh

4. **Customize individual layers**:
   - Adjust volume sliders for each sound
   - Use the swap button to replace specific sounds
   - Add additional layers with the "Add Layer" button

5. **Enjoy the visual** - View the AI-generated artwork that complements your soundscape

### Example Prompts

- `"Empty subway station at dawn"`
- `"Bustling coffee shop on a rainy afternoon"`
- `"Peaceful forest clearing with distant wildlife"`
- `"Urban rooftop garden during sunset"`
- `"Medieval market square during festival"`

## Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build production bundle with TypeScript compilation
- `npm run lint` - Run ESLint for code quality checks
- `npm run preview` - Preview production build locally

### Code Quality

The project maintains code quality through:
- **TypeScript** for type safety
- **ESLint** with React-specific rules for consistent code style
- **Modern React patterns** including hooks and functional components
- **Component-based architecture** for maintainable code

## Contributing

We welcome contributions! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit your changes**: `git commit -m 'Add amazing feature'`
4. **Push to the branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Development Guidelines
- Follow TypeScript best practices
- Maintain consistent code style with ESLint
- Add appropriate type definitions for new features
- Test your changes thoroughly before submitting

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **Freesound.org** community for providing audio samples and free API access
- **OpenAI** for AI capabilities through GPT and DALL-E 3
- **React and Vite teams** for development tools
- **Tailwind CSS** for CSS framework

**Getting API Keys**:
- [OpenAI API Key](https://platform.openai.com/api-keys) - Required for core functionality
- [Freesound API Key](https://freesound.org/apiv2/apply) - Required for quality sound library access

## Star History

If you find Soundscaper useful, please consider giving it a star on GitHub!

---

**Built with care by [Samuel Tjhia](https://github.com/samtjhia)**

*Transform your imagination into immersive audio-visual experiences with Soundscaper.*
