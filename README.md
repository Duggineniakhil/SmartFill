# SmartFill

Smart form autofill that learns. A privacy-first Chrome extension that learns and autofills your forms.

## Technologies Used

This project is built with:
- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
- Supabase

## Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v18 or higher)
- npm (comes with Node.js)

## Getting Started

Follow these steps to set up the project locally:

1. **Install dependencies:**
   ```sh
   npm install
   ```

2. **Run the development server:**
   ```sh
   npm run dev
   ```
   This will start the Vite dev server with hot-module replacement.

3. **Build for production:**
   ```sh
   npm run build
   ```
   The built assets will be available in the `dist` directory.

## Project Structure

- `src/` - Contains the React source code.
  - `components/` - Reusable UI components (shadcn-ui).
  - `pages/` - React Router pages (e.g., Auth, Dashboard).
  - `contexts/` - React Context providers (e.g., AuthContext).
  - `integrations/supabase/` - Supabase client and types.

## Authentication

This project uses Supabase for authentication. You will need to configure your Supabase environment variables for the application to function properly.

Ensure you have a `.env` file at the root of the project with:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Deployment

You can deploy the built application to platforms like Vercel, Netlify, or Cloudflare Pages by pointing them to the `dist` directory and setting the build command to `npm run build`.
