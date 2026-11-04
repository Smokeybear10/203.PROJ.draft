import Link from 'next/link'

export default function Home() {
  return (
    <div className="home">
      <section className="home-intro">
        <div className="home-copy">
          <p className="eyebrow">For internships & early-career roles</p>
          <h1>Show the work<br /><em>you can do.</em></h1>
          <p className="home-description">Put your projects and experience into a clear resume. Compare it with a real job posting, then keep a separate version for each application.</p>
          <div className="home-actions">
            <Link href="/builder" className="btn-exam">Work on your resume <span aria-hidden="true">→</span></Link>
            <Link href="/analyzer" className="text-link">Review a PDF or DOCX <span aria-hidden="true">↗</span></Link>
          </div>
          <p className="home-details">No account needed · Saved on your device · PDF export</p>
        </div>
        <figure className="resume-example" aria-label="Example of a concise resume">
          <figcaption><span>Sample resume</span><span>01 / 01</span></figcaption>
          <div className="example-document">
            <div className="example-heading"><h2>Alex Morgan</h2><p>Software engineer</p></div>
            <section><h3>Profile</h3><p>Engineer focused on reliable web applications and clear, useful interfaces.</p></section>
            <section><h3>Experience</h3><div className="example-role"><strong>Software engineer</strong><span>2022–2025</span></div><p>Built an internal reporting tool that reduced weekly preparation from four hours to one.</p><p>Worked with design and support to improve the onboarding experience.</p></section>
            <section><h3>Skills</h3><p>TypeScript · React · Python · PostgreSQL</p></section>
            <section><h3>Education</h3><p>B.S. Computer Science</p></section>
          </div>
          <div className="example-note">Example resume layout</div>
        </figure>
      </section>
      <section className="home-workflow" aria-labelledby="workflow-heading">
        <div className="workflow-heading"><p className="eyebrow">From experience to application</p><h2 id="workflow-heading">Keep the facts.<br />Make them relevant.</h2></div>
        <div className="workflow-links">
          <Link href="/builder"><span className="workflow-number">01</span><div><h3>Start with your work</h3><p>Keep your projects, internships, education, and skills in one base resume.</p></div><span aria-hidden="true">→</span></Link>
          <Link href="/builder"><span className="workflow-number">02</span><div><h3>Read it against the job</h3><p>See the posting’s technical terms beside the exact places you mention them.</p></div><span aria-hidden="true">→</span></Link>
          <Link href="/builder"><span className="workflow-number">03</span><div><h3>Keep each application separate</h3><p>Make a named copy, revise it, and download a PDF plus an editable backup.</p></div><span aria-hidden="true">→</span></Link>
        </div>
      </section>
    </div>
  )
}
