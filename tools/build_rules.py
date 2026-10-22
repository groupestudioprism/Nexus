#!/usr/bin/env python3
"""Assemble le fichier de règles COMPLET à publier : règles communes Studio Prism + bloc Nexus.

Usage : python3 tools/build_rules.py <règles communes actuelles> > firebase/firestore.rules

<règles communes actuelles> = le fichier de règles réellement publié dans la console (ou, à défaut, le plus complet des dépôts :
firebase/firestore.rules de SpectraWriter / SpectraCalc / SpectraSlide, qui contient le site, ARCHIPLAN, ARCHITRAFIC, ARCHIINDUS
et les trois SPECTRA). Aucune règle existante n'est modifiée : le bloc Nexus est inséré juste avant le refus final.
"""
import re, sys, pathlib

base = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
block = (pathlib.Path(__file__).resolve().parent.parent / "firebase" / "firestore-nexus.rules").read_text(encoding="utf-8")
if "match /nxUsers/{uid}" in base:
    sys.exit("Le fichier contient déjà le bloc Nexus : rien à faire.")
m = list(re.finditer(r"\n    match /\{document=\*\*\} \{\n      allow read, write: if false;\n    \}\n", base))
assert len(m) == 1, "refus final introuvable ou multiple"
i = m[0].start()
out = base[:i] + "\n\n" + block.rstrip() + "\n" + base[i:]
out = out.replace("(website, ARCHIPLAN, ARCHITRAFIC, ARCHIINDUS, SPECTRA Writer, SPECTRA Calc, SPECTRA Slide)",
                  "(website, ARCHIPLAN, ARCHITRAFIC, ARCHIINDUS, SPECTRA Writer, SPECTRA Calc, SPECTRA Slide, NEXUS)", 1)
assert len(out.encode()) < 256 * 1024, "au-delà de la limite Firebase de 256 Ko"
sys.stdout.write(out)
