import { type AppRoutePath } from '../lib/routes';
import './HomePage.css';

interface HomePageProps {
  onNavigate: (path: AppRoutePath) => void;
}

function HomePage({ onNavigate }: HomePageProps) {
  return (
    <main className="home-page">
      <section className="home-hero">
        <p className="home-kicker">Workbench Router</p>
        <h1>LLM Experiences</h1>
        <p>
          Pick the flow you want to use. `/llm-testing` keeps the streaming console, and
          `/generative-ui` builds a sandboxed runnable webpage from your prompt.
        </p>
      </section>

      <section className="home-grid">
        <article className="home-card">
          <h2>Generative UI</h2>
          <p>Describe a mini app and render AI-generated HTML, CSS, and JavaScript in a sandboxed iframe.</p>
          <button type="button" onClick={() => onNavigate('/generative-ui')}>
            Open /generative-ui
          </button>
        </article>

        <article className="home-card">
          <h2>LLM Testing</h2>
          <p>Use provider/model controls and stream plain-text responses from the backend LLM endpoint.</p>
          <button type="button" onClick={() => onNavigate('/llm-testing')}>
            Open /llm-testing
          </button>
        </article>
      </section>
    </main>
  );
}

export default HomePage;
