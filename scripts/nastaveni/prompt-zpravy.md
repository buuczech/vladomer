Vyhledej nejdůležitější zprávy z české domácí politiky za POSLEDNÍCH {{POCET_DNI}} DNÍ (dnes je {{DNESNI_DATUM}}). Starší zprávy nezařazuj – budou vyřazeny. Hledej opakovaně a napříč různými zpravodajskými weby.

Vyber NEJVÝŠE {{POCET_ZPRAV_K_NAVRZENI}} konkrétních zpravodajských článků s největším významem pro vládní agendu (legislativa, rozhodnutí vlády, personální změny, klíčové politické spory). Požadavky:
- Odkazuj na KONKRÉTNÍ článek o konkrétní události, nikdy na rozcestník, rubriku ani titulní stranu.
- Každý článek z JINÉHO webu — nikdy dva články ze stejné domény.
- Řaď od nejdůležitější zprávy.

{{POCET_ZPRAV_K_NAVRZENI}} je horní mez, ne úkol ke splnění. Tři skutečné zprávy jsou lepší výsledek než devět doplněných okrajovými články.

ALE: prázdná odpověď je skoro vždycky chyba. V české politice se za týden vždycky něco stane — schůze vlády, sněmovní jednání, vyjádření ministra, spor koalice s opozicí. Když ti vyhledávání vrátilo jakýkoli článek o vládě, parlamentu, ministerstvech nebo politických stranách, VYBER Z NĚJ. Prázdné pole vrať jedině tehdy, když vyhledávání nevrátilo vůbec nic použitelného — ne když ti zprávy připadají málo důležité. O tom, co je dost zajímavé, nerozhoduješ ty: raději méně významná skutečná zpráva než nic.

Používej jen URL, která se skutečně objevila ve výsledcích vyhledávání – NEVYMÝŠLEJ je. Nadpis napiš vlastními slovy (nekopíruj titulek).

Odpověz VŽDY platným JSON polem, i kdyby bylo prázdné. Nikdy neodpovídej větou, omluvou ani vysvětlením, proč to nejde — takovou odpověď program nepřečte a týdenní přehled zůstane prázdný. Začni [ a skonči ]. Žádný úvodní text, žádné markdown bloky:
[{"title_cs":"krátký nadpis","title_en":"short headline in English","summary_cs":"1 věta o čem to je","summary_en":"1 sentence in English","url":"https://...","date":"YYYY-MM-DD"}]
