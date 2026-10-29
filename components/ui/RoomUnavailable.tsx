'use client';
import Link from 'next/link';

export default function RoomUnavailable() {
  return <section className="scene-message unavailable" aria-labelledby="unavailable-heading">
    <p className="eyebrow">dhomhafiz.dev / workspace</p><h1 id="unavailable-heading">A room worth coming back to.</h1>
    <p>The interactive room could not start, or its graphics connection was lost. You can still read this introduction.</p>
    <p>I’m Mohd Hafiz. This personal workspace brings together software development, guitars and gravel cycling.</p>
    <p>You can still browse the projects and portfolio pages without entering the 3D room.</p>
    <div className="unavailable-actions">
      <button className="enter-button" onClick={() => window.location.reload()}>Try the room again</button>
      <Link className="boot-2d-link" href="/work">CONTINUE IN 2D</Link>
    </div>
  </section>;
}
