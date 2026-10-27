/** Product context and location disclosures for the game's virtual scenes. */
export default function AboutSkateRobot() {
  return (
    <main className="container location-about">
      <a className="location-about-back" href="/">← Skate Robot</a>
      <p className="settings-eyebrow">About</p>
      <h1>Made for the love of skating.</h1>
      <p>Skate Robot is an independent skate simulation. Play S.K.A.T.E. against a robot, or imagine a trick in Dream Tricks.</p>
      <section aria-labelledby="location-notice-title">
        <h2 id="location-notice-title">Location notice</h2>
        <p>Depicted locations do not imply affiliation with or endorsement by property owners, schools, businesses, or artists.</p>
        <p>Some scenes draw on classic street spots; others use redesigned settings. Buildings, scenery, and layouts may be simplified or changed. Virtual scenes do not establish real-world access or permission to skate, and do not describe current conditions.</p>
      </section>
      <a className="location-about-back" href="/dream-tricks">Explore Dream Tricks →</a>
    </main>
  );
}
