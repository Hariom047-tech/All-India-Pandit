import { GalleryManager } from "../components/GalleryManager";

/**
 * Home page hero images.
 *
 * The hero used to display the three highest-ranked pandits automatically,
 * which quietly coupled an editorial surface to the ranking algorithm —
 * promoting a pandit changed the front page. These three slots are now
 * chosen deliberately.
 */
export default function HomeSettings() {
  return (
    <>
      <div className="admin-page-head">
        <div>
          <h2 style={{ fontFamily: "var(--font-head)", fontSize: "1.4rem" }}>Home page</h2>
          <p>Manage the three circular hero images shown at the top of the homepage.</p>
        </div>
      </div>

      <GalleryManager
        basePath="/home-hero"
        title="Hero images"
        hint="Exactly 3 images are shown. Square or portrait crops look best in the circular frames. Max 8 MB each."
        accept="image/jpeg,image/png,image/webp,image/avif"
        maxItems={3}
      />
    </>
  );
}
