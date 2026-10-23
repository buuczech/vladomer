# Tasks: Měsíční běh

- [x] T001 `.github/workflows/mesicni-beh.yml` (workflow_call): hodnocení → kontrola faktů → rozhodnutí → konzistence → zápis → PR → report; artefakty i při selhání
- [x] T002 `deploy.yml`: cron `15 5 1 * *`, pojistka „už tento měsíc“, dispatch `rezim_behu` (plny | delta), nasazení jen po úspěšném běhu
- [x] T003 `dev2-eval.yml`: režim `generalka` volá tutéž definici se `zkouska: true`
- [x] T004 Pojistka ceny na celý běh (`faktcheck.js --zapsat-naklady`), cena kontroly do `public/naklady.json`
- [x] T005 Instagram: `workflow_run` po plánovaném nasazení, texty „Měsíční shrnutí“, „Změny za měsíc“
- [x] T006 Texty webu (metodika včetně sekcí „Kontrola faktů“ a „Změny metodiky“, FAQ, prompty, odznak „čeká na ověření“, `dalsiBeh()`), `/prehled/`, JSON-LD, og-image, index.html, README, LICENSE-DATA, NAVOD, skills
- [x] T007 `test-konzistence` [H]: žádný týdenní rytmus, žádný model natvrdo, každý prompt má vysvětlivku
- [ ] T008 Při sloučení ověřit měsíc v „Změny metodiky“ (napsáno „Listopad 2026“ — sloučení je nejdřív po 1. 12., první ostrý měsíční běh tedy nejdřív v lednu 2027) a deklaraci nestrannosti (vlastník rozhoduje o podržených bodech)
- [ ] T009 Dvě generálky celého workflow (placené, každou zvlášť schvaluje vlastník; 23. 10. 2026): 1. 11. z dat main, 1. 12. navazuje na `zkouska/2026-11` i s rozhodnutími. Každá srovnaná s main. Sloučení DEV2 → main nejdřív po té prosincové
- [x] T010 Generálka nad daty z jiné větve (`vstup_dat`: main | zkouska/RRRR-MM, `mesicni-beh.yml`, `mereni-parametry.js`) a srovnání s main v e-mailu, v souhrnu běhu a v příloze (`lib/srovnani.js`, `report.js --srovnani-main`, `scripts/dev/srovnani-s-main.js`, test v `test-report.js`)
