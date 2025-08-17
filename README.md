# Soundscaper

**Transport yourself anywhere with AI-layered soundscapes.**

## Why I Built This

Silence wrecks my focus. Coffee shops, libraries, or even just being outside help me concentrate because of the background noise. I wanted a way to bring that feeling anywhere, on demand — not just looping rain sounds.  

Soundscaper is my attempt at that. You type a scene like *“cozy cabin in a thunderstorm”* or *“patio at sunrise,”* and the app builds it out with the sounds that actually matter — thunder rolling outside, wood creaking, birds chirping. It layers everything together so if you close your eyes, you feel like you’re there. On top of that, it generates artwork to match the vibe.  

Unlike looping youtube audios, with Soundscaper you’re in control: add or swap tracks, tweak volumes, and shape the environment to your taste.  

## What It Does  

- Takes a text prompt and turns it into a layered soundscape  
- Finds matching sounds from [Freesound](https://freesound.org) with the help of GPT  
- Generates artwork with DALL·E 3 to complete the atmosphere  
- Lets you mix, balance, and swap tracks live in the browser  
- Caches audio locally so you’re not hammering APIs on every run

For more information check out the [devpost](https://devpost.com/software/soundscaper-89o5eh)

https://github.com/user-attachments/assets/63655245-2d24-4398-99b2-5886fbe9b24f

## Features  

- **AI-guided sound selection** – GPT picks sounds that fit the vibe like the defining sounds of the environment  
  - Uses Freesound’s community data (loopability, ratings, length) to score sounds  
  - Searches with curated tags while blocking “bad fit” ones (like music remixes or noisy uploads)  

- **Multi-layer mixing** – combine and balance multiple tracks at once  
  - On generation, audio levels are set automatically based on the scene’s context (e.g., background ambience vs. foreground effects)  

- **Smart caching + fallbacks** – IndexedDB caching and a small whitelist keep it running even when APIs fail  

- **Visual generation** – each soundscape comes with matching artwork from DALL·E 3  

- **Interactive controls** – add/remove layers, adjust gain, swap sounds, or clear everything in one click  

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
   VITE_FREESOUND_TOKEN=your_freesound_token_here
   ```

   **Note**: Both API keys are required for full functionality. The Freesound API key provides access to the library of community-contributed sounds necessary for creating diverse soundscapes.

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to `http://localhost:5173` to start creating soundscapes!

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
- **HTML Audio Elements** - Browser audio playback using standard audio elements
- **IndexedDB Caching** - Audio file caching to reduce API calls and improve performance
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
│   │   └── idb.ts             # IndexedDB caching layer for reducing API calls
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
- `"Bustling coffee shop on a rainy afternoon while studying"`
- `"Walking in the forest at night"`
- `"Cozy cabin stuck in a thunderstorm"`

## Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build production bundle with TypeScript compilation
- `npm run preview` - Preview production build locally

### API Keys and Limitations

**[OpenAI API Key](https://platform.openai.com/api-keys)** (Pay Yourself):
- Used for intelligent sound selection via GPT models and image generation via DALL-E 3
- Without this key, the application cannot generate soundscapes or images

**[Freesound API Key](https://freesound.org/apiv2/apply)** (Free - 2000 cap per day):
- Provides access to the full Freesound.org library of community sounds
- **Rate Limits**: Free tier allows limited requests per day
- **Caching System**: Audio files are automatically cached locally using IndexedDB to minimize API usage and improve performance
- **Fallback System**: A minimal whitelist exists for testing purposes, but the Freesound API is essential for creating quality soundscapes

**Graceful Degradation**: Soundscaper includes a minimal fallback system for testing, but both API keys are required for the intended user experience.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

*Transform your imagination into immersive audio-visual experiences with Soundscaper.*
