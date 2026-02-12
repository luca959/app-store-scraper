'use strict';

const puppeteer = require('puppeteer');

function privacy(opts) {
  opts.country = opts.country || 'US';

  return new Promise(async (resolve, reject) => {
    if (!opts.id) return reject(Error('ID required'));

    const country = opts.country.toLowerCase();
    const url = `https://apps.apple.com/${country}/app/id${opts.id}`;

    let browser;
    try {
      browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

      // Click modale
      const modalTriggerSelector = '#privacyHeader a[href="#"], [aria-label*="Privacy"], [data-test-id="privacy-details-button"]';
      try {
        const trigger = await page.$(modalTriggerSelector);
        if (trigger) {
          await trigger.click();
          await page.waitForSelector('dialog[open]', { timeout: 3000 });
          await new Promise(r => setTimeout(r, 1000));
        }
      } catch (e) { }

      // --- SCRAPING GERARCHICO ---
      const privacyData = await page.evaluate(() => {
        // Struttura finale desiderata
        const out = {
          linkedToYou: [],
          notLinkedToYou: []
        };

        // Funzioni di utilità per normalizzare testo
        const normalize = (s) => (s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        // Riconosce i "Macro-gruppi" (Titoli grandi nello screenshot)
        const isLinkageHeading = (tNorm) => {
          if (tNorm == "data linked to you") return "linkedToYou";
          if (tNorm == "data not linked to you") return "notLinkedToYou";
          return null;
        };

        const root = document.querySelector('dialog[open] .content-container') ||
          document.querySelector('dialog[open]') ||
          document.querySelector('#privacyHeader') ||
          document;

        if (!root) return out;

        // Selettore che prende TUTTI i nodi per ricostruire l'ordine visivo
        const allNodes = root.querySelectorAll('h2, h3, h4, ul, div[class*="grid"], section');

        let currentLinkage = null; // Es: "linkedToYou"
        let currentPurpose = null; // Es: oggetto { purpose: "Third-Party Advertising", ... }

        // Funzione per salvare il purpose corrente nel bucket giusto
        const pushPurpose = () => {
          if (currentLinkage && currentPurpose && currentPurpose.dataCategories.length > 0) {
            out[currentLinkage].push(currentPurpose);
          }
          currentPurpose = null;
        };

        allNodes.forEach(node => {
          const tagName = node.tagName;
          const text = (node.innerText || "").trim();
          if (!text) return;
          const tNorm = normalize(text);

          // 1. GESTIONE TITOLI (H2, H3, H4)
          if (['H2', 'H3', 'H4'].includes(tagName)) {
            if (tNorm === 'app privacy' || tNorm === 'privacy dell’app') return;

            // A) È un Macro-gruppo? (Linked / Not Linked)
            const linkage = isLinkageHeading(tNorm);
            if (linkage) {
              pushPurpose(); // Chiudi purpose precedente
              currentLinkage = linkage; // Cambia contesto macro
              return;
            }

            // B) Se non è macro, è un PURPOSE (es: "Third-Party Advertising")
            // Deve esserci un macro-gruppo attivo per accettarlo
            if (currentLinkage) {
              // Filtri per evitare titoli spazzatura
              if (text.includes('Developer') && text.length < 15) return;

              pushPurpose(); // Chiudi quello di prima

              // Crea nuovo Purpose
              currentPurpose = {
                purpose: text, // <--- Ecco la categoria "purpose" richiesta
                dataCategories: []
              };
            }
          }

          // 2. GESTIONE DATI (Griglie/Liste)
          // Raccoglie Category e Types sotto il Purpose corrente
          else if ((tagName === 'UL' || (node.className && node.className.includes('grid'))) && currentPurpose) {
            const items = node.querySelectorAll('li, .privacy-category, .grid-item');

            items.forEach(item => {              const lines = item.innerText.split('\n')
                .map(s => s.trim())
                .filter(s => s.length > 0);

              if (lines.length > 0) {
                const categoryName = lines[0]; // Es: "Location"

                currentPurpose.dataCategories.push({
                  category: categoryName
                });
              }
            });
          }
        });

        // Salva l'ultimo pezzo rimasto appeso
        pushPurpose();

        return out;
      });

      await browser.close();

      resolve({
        appId: opts.id,
        country: country.toUpperCase(),
        privacy: privacyData
      });

    } catch (err) {
      if (browser) await browser.close();
      resolve({ appId: opts.id, error: err.message, privacy: {} });
    }
  });
}

module.exports = privacy;
