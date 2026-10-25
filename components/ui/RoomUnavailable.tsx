'use client';
export default function RoomUnavailable() {
  return <section className="scene-message unavailable" aria-labelledby="unavailable-heading">
    <p className="eyebrow">dhomhafiz.dev / workspace</p><h1 id="unavailable-heading">A room worth coming back to.</h1>
    <p>The interactive room could not start, or its graphics connection was lost. You can still read this introduction.</p>
    <p>I’m Mohd Hafiz. This personal workspace brings together software development, guitars and gravel cycling.</p>
    <p>Projects, skills and contact details will be added in a later phase.</p>
    <button className="enter-button" onClick={() => window.location.reload()}>Try the room again</button>
  </section>;
}
