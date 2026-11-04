import Link from 'next/link'

export default function AboutPage() {
  return (
    <div className="tool-wrapper">
      <article className="tool-paper about-page">
        <header className="tool-header"><p className="eyebrow">About the project</p><h1 className="tool-header-title">A second look<br />at your resume.</h1><p className="tool-description">Draft brings resume checks, a document builder, and job-board search links into one place.</p></header>
        <div className="about-sections">
          <section><h2>What the review tells you</h2><p>The review shows text extracted from your file, recognized section headings, and keywords found for the role you select. The role profiles are examples, so compare them with the actual job posting.</p><p>These checks can help you revise a document. They do not predict an employer’s ATS results or whether you will get an interview.</p></section>
          <section><h2>Keep your judgment</h2><p>Use the suggestions that fit your experience. Don’t add skills you don’t have or results you can’t support. Describe what you did and what changed because of your work.</p></section>
          <section><h2>Work on a real application</h2><p>Keep a base resume and make separate copies for the roles you apply to. Paste a job posting to see its technical terms alongside exact excerpts from your projects, experience, and skills. The comparison distinguishes a term listed in Skills from one used in a project or experience description.</p><p>A mention is not proof of proficiency. Read the original requirements and add only experience you can explain. The tool does not invent accomplishments or assess whether you qualify for a role.</p></section>
          <section><h2>Your files and drafts</h2><p>Uploaded resumes are processed in memory for file review and are not saved by the app. Your editable resumes and job postings stay in this browser. There is no account or cloud sync.</p><p>Download an editable backup to move your work to another browser or restore it later. Clearing browser data removes locally saved resumes. A PDF is for applications; the editable backup preserves your fields and versions.</p></section>
          <section><h2>Build a clean document</h2><p>The builder gives you a live preview and a downloadable PDF with selectable text. Job boards opens searches on external sites; it doesn’t provide live job counts or salary data.</p><Link className="text-link" href="/builder">Open the builder <span aria-hidden="true">→</span></Link></section>
          <section className="about-author"><h2>Built by Thomas Ou</h2><p>Fullstack engineer working with TypeScript, React, Next.js, and Python.</p><div className="about-links"><a href="https://thomasou.com">Website</a><a href="https://github.com/Smokeybear10/203.PROJ.draft">GitHub</a><a href="https://www.linkedin.com/in/thomasou0/">LinkedIn</a></div></section>
        </div>
      </article>
    </div>
  )
}
