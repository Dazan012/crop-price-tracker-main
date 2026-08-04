import { Link } from 'react-router-dom';
import { Users, Mail, Github, Linkedin, ArrowLeft } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Developer data — replace with the real team                        */
/* ------------------------------------------------------------------ */
const DEVELOPERS = [
  {
    name: 'Developer One',
    role: 'Project Lead',
    photo: '',
    email: 'developer.one@example.com',
    github: 'https://github.com/example',
    linkedin: 'https://linkedin.com/in/example',
  },
  {
    name: 'Developer Two',
    role: 'Full-Stack Developer',
    photo: '',
    email: 'developer.two@example.com',
    github: 'https://github.com/example',
    linkedin: 'https://linkedin.com/in/example',
  },
  {
    name: 'Developer Three',
    role: 'UI/UX & Frontend',
    photo: '',
    email: 'developer.three@example.com',
    github: 'https://github.com/example',
    linkedin: 'https://linkedin.com/in/example',
  },
  {
    name: 'Developer Four',
    role: 'Data & Analytics',
    photo: '',
    email: 'developer.four@example.com',
    github: 'https://github.com/example',
    linkedin: 'https://linkedin.com/in/example',
  },
];

export default function Developers() {
  return (
    <div>
      {/* ── HERO SECTION ─────────────────────────────────────── */}
      <section className="hero-section">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', background: 'var(--accent-glow)',
            border: '1px solid var(--border)', borderRadius: 20,
            fontSize: '0.8rem', color: 'var(--accent)', marginBottom: 24,
          }}>
            <Users size={14} /> The Team Behind Smart Crops
          </div>

          <h1 className="hero-title">Meet the Developers</h1>
          <p className="hero-subtitle">
            The minds building Tanzania&rsquo;s trusted crop price intelligence
            platform, proudly developed at the Mbeya University of Science and Technology.
          </p>

          <div style={{ marginTop: 24 }}>
            <Link to="/" className="btn btn-secondary">
              <ArrowLeft size={14} /> Back to Home
            </Link>
          </div>
        </div>
      </section>

      {/* ── TEAM GRID ─────────────────────────────────────────── */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '0 24px 80px' }}>
        <div className="developers-grid">
          {DEVELOPERS.map((dev) => (
            <div key={dev.name} className="glass-card dev-card fade-in">
              {dev.photo ? (
                <img className="dev-photo" src={dev.photo} alt={dev.name} />
              ) : (
                <div className="dev-avatar">
                  {dev.name.split(' ').map((n) => n[0]).join('')}
                </div>
              )}
              <h3 className="dev-name">{dev.name}</h3>
              <span className="dev-role">{dev.role}</span>
              <div className="dev-links">
                {dev.email && (
                  <a href={`mailto:${dev.email}`} aria-label={`Email ${dev.name}`}>
                    <Mail size={16} />
                  </a>
                )}
                {dev.github && (
                  <a href={dev.github} target="_blank" rel="noopener noreferrer" aria-label={`GitHub ${dev.name}`}>
                    <Github size={16} />
                  </a>
                )}
                {dev.linkedin && (
                  <a href={dev.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`LinkedIn ${dev.name}`}>
                    <Linkedin size={16} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
