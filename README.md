# Daniel Román — bilingual portfolio website

A static, bilingual portfolio designed for **free hosting on GitHub Pages**. English is the default language; the ES/EN control remembers the visitor's choice.

## Editorial decision

This is not a full CV online. It sells one coherent artistic identity through four currents:

1. **Bruegel Sound** — the main live project.
2. **Labio** — the key recorded work.
3. **Marisa Manchado research** — the academic line.
4. **Motor de Pensamiento Imaginal** — a live research prototype, introduced through the navigable Córdoba world.

Press coverage is used as external proof rather than filling the site with a long chronology. A compressed twelve-second loop introduces the Córdoba interface without making the portfolio heavy or turning it into a software manual.

## Free publication with GitHub Pages

GitHub Pages is free from a **public repository** on GitHub Free.

1. Create a new public repository, for example `romanrodaniel-site`.
2. Upload every file and folder from this package to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select `main` and `/ (root)`, then save.
6. In **Custom domain**, enter `romanrodaniel.com` and save.
7. At the company where the domain is registered, point the domain to GitHub Pages.

### DNS records for the apex domain

Create four A records for `@`:

- `185.199.108.153`
- `185.199.109.153`
- `185.199.110.153`
- `185.199.111.153`

For `www`, create a CNAME record pointing to:

- `romanrodaniel-rgb.github.io`

After DNS propagation, enable **Enforce HTTPS** in GitHub Pages. DNS changes can take up to 24 hours.

## Before final publication

- Confirm that the current domain remains registered after cancelling Squarespace hosting. The domain registration itself may still have an annual renewal cost; only the hosting becomes free.
- Confirm permission to republish the press images or replace them with original high-resolution files owned by Daniel.
- Check the publication URL for the Marisa Manchado research article and update it if necessary.
- Review all copy and external links.

## Editing

- Text and links: `index.html`
- Spanish/English translations: `script.js`
- Design and responsive layout: `styles.css`
- Images and the Córdoba preview loop: `assets/`

No build process, database, cookies, analytics or paid service is required.


## Córdoba prototype section

The site now presents two clearly separated stages:

- **Now:** one curated and playable world, Córdoba, to demonstrate the interface through images, texts and sounds.
- **In development:** loading and processing additional worlds.

The button is intentionally inactive until the stable Córdoba prototype is copied into a public folder such as `mpi/cordoba/`. When that package is ready, replace the disabled button with a link to that route.

The supplied video was reduced from the original recording to a silent, looping web preview of approximately 1 MB. The original 73 MB recording is not needed for publication.
