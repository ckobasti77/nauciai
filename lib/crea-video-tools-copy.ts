import type { LocalizedText } from "./i18n";

/**
 * Tekstovi K20 alata: Video · Izmeni (izmeni rečima, zameni, prekroji kadar,
 * boje, pozadina, uvećaj, usporeno, treperenje), Pokret (Odglumi) i Govor (Lik
 * koji govori). Uvoze ih samo alati (lenji chunk-ovi).
 */

type T = LocalizedText;

export const CREA_VIDEO_TOOLS_COPY = {
  // ── Zajedničko ────────────────────────────────────────────────────────────
  videoInfo: { sr: "{s} s · {w} × {h}", en: "{s} s · {w} × {h}" } as T,
  probing: { sr: "Čitam video…", en: "Reading the video…" } as T,
  probeFailed: {
    sr: "Ovaj video tvoj pregledač ne ume da otvori. Probaj MP4 snimak ili Chrome na računaru.",
    en: "Your browser cannot open this video. Try an MP4 file or Chrome on a computer.",
  } as T,
  resultInfo: { sr: "{w} × {h} · {s} s", en: "{w} × {h} · {s} s" } as T,
  soundKept: { sr: "zvuk je sačuvan", en: "the sound is kept" } as T,
  soundDropped: { sr: "bez zvuka", en: "no sound" } as T,
  soundLost: {
    sr: "Zvuk nije mogao da se prenese u ovom pregledaču, pa je video bez zvuka.",
    en: "The sound could not be carried over in this browser, so the video has no sound.",
  } as T,
  resultLabel: { sr: "Gotov video", en: "Finished video" } as T,
  keepTabOpen: { sr: "Ne zatvaraj karticu dok radi - sve se dešava na tvom uređaju.", en: "Keep this tab open while it works - everything happens on your device." } as T,
  demoModel: { sr: "Ovaj model radi u DEMO režimu - izlaz je probni, ne pravi.", en: "This model runs in DEMO mode - the output is a sample, not real." } as T,
  noAccess: { sr: "Plaćeni alati rade uz pristup Crei.", en: "Paid tools work with access to Crea." } as T,
  unavailable: { sr: "Model za ovo trenutno nije dostupan.", en: "The model for this is not available right now." } as T,
  sent: { sr: "Poslato - rad se pojavljuje u istoriji desno.", en: "Sent - the work appears in the history on the right." } as T,
  working: { sr: "Šaljem…", en: "Sending…" } as T,
  quality: { sr: "Kvalitet", en: "Quality" } as T,
  needVideo: { sr: "Izaberi video.", en: "Pick a video." } as T,
  demoSource: { sr: "DEMO rad nema pravi video. Izaberi drugi.", en: "A DEMO work has no real video. Pick another one." } as T,
  measuring: { sr: "Merim trajanje…", en: "Measuring the length…" } as T,
  perSecond: { sr: "Plaća se po sekundi videa.", en: "Paid per second of video." } as T,
  tooLong: {
    sr: "Video je predug za izradu na ovom uređaju (najviše oko {min} min). Skrati ga u Montaži, pa probaj ponovo.",
    en: "The video is too long to process on this device (about {min} min at most). Trim it in Editing, then try again.",
  } as T,

  // ── Prekroji kadar (V15) ─────────────────────────────────────────────────
  reframeTarget: { sr: "Novi oblik kadra", en: "New frame shape" } as T,
  reframeTargets: {
    "9:16": { sr: "9:16 · TikTok, Reels", en: "9:16 · TikTok, Reels" } as T,
    "1:1": { sr: "1:1 · kvadrat", en: "1:1 · square" } as T,
    "16:9": { sr: "16:9 · YouTube", en: "16:9 · YouTube" } as T,
    "4:5": { sr: "4:5 · Instagram objava", en: "4:5 · Instagram post" } as T,
  },
  reframeRun: { sr: "Prekroji video", en: "Reframe the video" } as T,
  reframeSame: { sr: "Video već ima taj oblik. Izaberi drugi.", en: "The video already has that shape. Pick another one." } as T,
  reframeHow: {
    sr: "Crea nađe lice nekoliko puta u sekundi i kadar ga glatko prati - sitni pokreti glave se ne prate, pa slika ne skače.",
    en: "Crea finds the face several times a second and the frame follows it smoothly - small head moves are ignored, so the picture does not jump.",
  } as T,
  reframeNoFace: {
    sr: "Lice nismo našli u većem delu videa, pa je kadar uglavnom u sredini.",
    en: "We did not find a face in most of the video, so the frame stays mostly in the centre.",
  } as T,
  reframeFaces: { sr: "Lice u {p} % videa", en: "Face in {p} % of the video" } as T,

  // ── Boje (V16) ───────────────────────────────────────────────────────────
  colorRun: { sr: "Oboji video", en: "Colour the video" } as T,
  colorFrame: { sr: "Kadar za pregled", en: "Frame for the preview" } as T,

  // ── Pozadina (V18) ───────────────────────────────────────────────────────
  bgRun: { sr: "Zameni pozadinu", en: "Replace the background" } as T,
  bgGreen: { sr: "Zeleno platno (za montažu)", en: "Green screen (for editing)" } as T,
  bgObjects: {
    sr: "Ovo radi za LJUDE. Predmete i ljubimce iz videa ćemo isecati uz kredite - uskoro.",
    en: "This works for PEOPLE. Cutting objects and pets out of a video will cost credits - coming soon.",
  } as T,
  bgNoPerson: {
    sr: "Osobu nismo našli u većem delu videa - proveri da je u kadru i dovoljno osvetljena.",
    en: "We did not find a person in most of the video - check that they are in frame and well lit.",
  } as T,
  bgNoTransparent: {
    sr: "Video ne može da bude providan kao slika; za montažu izaberi zeleno platno.",
    en: "A video cannot be transparent like an image; for editing pick the green screen.",
  } as T,

  // ── Usporeno (V17) ───────────────────────────────────────────────────────
  slowFactor: { sr: "Koliko sporije", en: "How much slower" } as T,
  slowFactors: { 2: { sr: "2× sporije", en: "2× slower" } as T, 4: { sr: "4× sporije", en: "4× slower" } as T },
  slowStart: { sr: "Deo videa od {s} s (najviše 10 s)", en: "Part of the video from {s} s (10 s at most)" } as T,
  slowRun: { sr: "Uspori", en: "Slow it down" } as T,
  slowHow: {
    sr: "Između svaka dva kadra ubacujemo meko stopljene kadrove - bez AI-a, na tvom uređaju. Zvuk se izbacuje (usporen zvuk se ne razume).",
    en: "Softly blended frames go between every two frames - no AI, on your device. The sound is dropped (slowed-down sound is not understandable).",
  } as T,
  slowAiSoon: { sr: "AI usporavanje (RIFE, izmišlja nove kadrove) stiže uskoro.", en: "AI slow motion (RIFE, invents new frames) is coming soon." } as T,

  // ── Treperenje (V17) ─────────────────────────────────────────────────────
  flickerRun: { sr: "Ukloni treperenje", en: "Remove flicker" } as T,
  flickerBefore: { sr: "Treperenje pre: {p} %", en: "Flicker before: {p} %" } as T,
  flickerAfter: { sr: "Treperenje posle: {p} %", en: "Flicker after: {p} %" } as T,
  flickerNone: { sr: "Ovaj video skoro ne treperi - razlika će biti mala.", en: "This video barely flickers - the difference will be small." } as T,
  flickerHow: {
    sr: "Crea izmeri svetlinu svakog kadra i ujednači je sa susednim kadrovima. Spora promena svetla i rez između scena ostaju.",
    en: "Crea measures the brightness of every frame and evens it out with the neighbouring frames. Slow light changes and cuts between scenes stay.",
  } as T,

  // ── Izmeni rečima (V13) i zameni (V14) ───────────────────────────────────
  editRoute: { sr: "Kojim modelom", en: "Which model" } as T,
  editRouteProblems: {
    prekratko: { sr: "video je kraći od {min} s", en: "the video is shorter than {min} s" } as T,
    predugo: { sr: "samo do {max} s", en: "only up to {max} s" } as T,
  },
  editExamples: { sr: "Primeri - klikni jedan", en: "Examples - click one" } as T,
  editText: { sr: "Svojim rečima (nije obavezno uz primer)", en: "In your own words (optional with an example)" } as T,
  editPlaceholder: { sr: "npr. dodaj kišobran u ruku devojke", en: "e.g. add an umbrella in the girl's hand" } as T,
  editRun: { sr: "Izmeni video", en: "Edit the video" } as T,
  editNeedText: { sr: "Izaberi primer ili napiši šta da se promeni.", en: "Pick an example or write what should change." } as T,
  editSeedanceNote: {
    sr: "Seedance pravi novi video bez zvuka, iste dužine kao tvoj.",
    en: "Seedance makes a new video without sound, as long as yours.",
  } as T,
  swapWhat: { sr: "Šta menjaš", en: "What you swap" } as T,
  swapKinds: { predmet: { sr: "Predmet", en: "An object" } as T, lik: { sr: "Osobu - mojim Likom", en: "The person - with my character" } as T },
  swapNewObject: { sr: "Novi predmet (iz tvojih Likova)", en: "The new object (from your Characters)" } as T,
  swapNoObjects: {
    sr: "Još nemaš sačuvan predmet ni mesto. Napravi ga u Likovima - slika predmeta se čuva jednom i koristi svuda.",
    en: "You have no saved object or place yet. Make one in Characters - the object's picture is saved once and used everywhere.",
  } as T,
  swapMakeObject: { sr: "Otvori Likove i dodaj predmet", en: "Open Characters and add an object" } as T,
  swapNeedObject: { sr: "Izaberi šta menjaš i sačuvan predmet koji ulazi u video.", en: "Pick what you swap and a saved object that goes into the video." } as T,
  swapRun: { sr: "Zameni u videu", en: "Swap in the video" } as T,
  swapLikNote: {
    sr: "Glavna osoba u videu postaje tvoj Lik. Samo tvoj Lik sa pristankom, samo Kling O3.",
    en: "The main person in the video becomes your character. Only your own character with consent, Kling O3 only.",
  } as T,

  // ── Uvećaj (V17) ─────────────────────────────────────────────────────────
  upscaleSize: { sr: "Nova veličina", en: "New size" } as T,
  upscaleRun: { sr: "Uvećaj video", en: "Upscale the video" } as T,

  // ── Lice (Lik ili rad iz Cree) ───────────────────────────────────────────
  faceTitle: { sr: "Ko je na snimku", en: "Who is in the clip" } as T,
  faceTitleVideo: { sr: "Tvoj video iz Cree", en: "Your video from Crea" } as T,
  faceLiks: { sr: "Moji Likovi", en: "My characters" } as T,
  faceWorks: { sr: "Moji radovi iz Cree", en: "My works from Crea" } as T,
  faceEmpty: {
    sr: "Još nemaš Lika sa pristankom. Sačuvaj sebe kao Lika u Slika · Likovi, pa se vrati.",
    en: "You have no character with consent yet. Save yourself as a character in Image · Characters, then come back.",
  } as T,
  faceEmptyVideo: {
    sr: "Još nemaš video koji je Crea napravila od tvog Lika. Prvo napravi „Slika progovori”.",
    en: "You have no video Crea made from your character yet. Make \"Picture talks\" first.",
  } as T,
  faceOpenLiks: { sr: "Otvori Likove", en: "Open characters" } as T,
  faceRule: {
    sr: "Samo tvoj Lik (sa pristankom) ili rad koji je Crea napravila od tvojih Likova ili iz opisa - nikad tuđa fotka.",
    en: "Only your own character (with consent) or a work Crea made from your characters or from a description - never someone else's photo.",
  } as T,
  faceLoading: { sr: "Učitavam…", en: "Loading…" } as T,
  facePick: { sr: "Izaberi: {name}", en: "Pick: {name}" } as T,
  faceWork: { sr: "rad iz Cree", en: "a Crea work" } as T,
  consent: {
    sr: "Ovo je moj Lik ili lik koji sam napravio u Crei, i pristajem da ga pokrenem.",
    en: "This is my own character or one I made in Crea, and I agree to animate it.",
  } as T,
  needConsent: { sr: "Potvrdi pristanak.", en: "Confirm your consent." } as T,
  needFace: { sr: "Izaberi Lika ili rad.", en: "Pick a character or a work." } as T,
  faceErrors: {
    LIK_NIJE_DOSTUPAN: { sr: "Ovaj Lik nema pristanak ili nije tvoj.", en: "This character has no consent or is not yours." } as T,
    LICE_NIJE_DOZVOLJENO: {
      sr: "Ovaj rad ne može: lice mora biti tvoj Lik ili rad koji je Crea napravila bez tuđe fotke.",
      en: "This work cannot be used: the face must be your character or a work Crea made without someone else's photo.",
    } as T,
  },

  // ── Odglumi (V20) ────────────────────────────────────────────────────────
  actMotion: { sr: "Pokret", en: "The move" } as T,
  actSources: { kamera: { sr: "Snimi sebe", en: "Record yourself" } as T, video: { sr: "Okači snimak", en: "Upload a clip" } as T },
  actCameraOn: { sr: "Uključi kameru", en: "Turn on the camera" } as T,
  actCameraOff: { sr: "Isključi kameru", en: "Turn off the camera" } as T,
  actSeconds: { sr: "Koliko dugo snimaš", en: "How long you record" } as T,
  actRecord: { sr: "Snimaj", en: "Record" } as T,
  actAgain: { sr: "Snimi ponovo", en: "Record again" } as T,
  actCountdown: { sr: "Kreće za {n}…", en: "Starting in {n}…" } as T,
  actRecording: { sr: "Snimam · još {n} s", en: "Recording · {n} s left" } as T,
  actFinishing: { sr: "Pakujem snimak…", en: "Packing the clip…" } as T,
  actPreviewLabel: { sr: "Kamera (u ogledalu)", en: "Camera (mirrored)" } as T,
  actClipLabel: { sr: "Tvoj snimak pokreta", en: "Your motion clip" } as T,
  actSelf: { sr: "Na snimku sam ja.", en: "That is me in the clip." } as T,
  actNeedSelf: { sr: "Potvrdi da si na snimku ti.", en: "Confirm that it is you in the clip." } as T,
  actNeedClip: { sr: "Snimi ili okači pokret (3-10 s).", en: "Record or upload a move (3-10 s)." } as T,
  actRun: { sr: "Odglumi", en: "Act it out" } as T,
  actHow: {
    sr: "Stani tako da ti se vidi celo telo, pokreti neka budu jasni. Lik sa slike ponovi tvoj pokret.",
    en: "Stand so your whole body is visible and make clear moves. The character from the picture repeats your move.",
  } as T,
  actPrice: { sr: "≈ {kr} za {s} s", en: "≈ {kr} for {s} s" } as T,
  cameraProblems: {
    dozvola: {
      sr: "Kamera nije dozvoljena. Dozvoli je u podešavanjima pregledača (ikonica katanca pored adrese) i probaj ponovo.",
      en: "The camera is not allowed. Allow it in your browser settings (the padlock next to the address) and try again.",
    } as T,
    "nema-kamere": { sr: "Kamera nije pronađena ili je zauzeta drugim programom.", en: "No camera was found, or another app is using it." } as T,
    nebezbedno: { sr: "Kamera radi samo na sigurnoj adresi (https).", en: "The camera works only on a secure address (https)." } as T,
    "ne-podrzava": {
      sr: "Ovaj pregledač ne ume da snima kameru. Okači snimak sa telefona umesto toga.",
      en: "This browser cannot record the camera. Upload a clip from your phone instead.",
    } as T,
  },

  // ── Lik koji govori (V21-V23) ────────────────────────────────────────────
  talkOutput: { sr: "Šta progovori", en: "What talks" } as T,
  talkOutputs: {
    avatar: { sr: "Slika progovori", en: "Picture talks" } as T,
    usne: { sr: "Video progovori (usne)", en: "Video talks (lips)" } as T,
  },
  talkOutputHints: {
    avatar: { sr: "Lik ili slika iz Cree", en: "A character or a Crea picture" } as T,
    usne: { sr: "tvoj video iz Cree", en: "your Crea video" } as T,
  },
  talkScene: { sr: "Scena", en: "Scene" } as T,
  talkSceneOnlyLik: { sr: "Scena se bira uz Lika; slika iz Cree govori kakva jeste.", en: "A scene goes with a character; a Crea picture talks as it is." } as T,
  talkVoice: { sr: "Glas", en: "Voice" } as T,
  talkVoices: {
    tekst: { sr: "Napiši tekst", en: "Write a text" } as T,
    snimak: { sr: "Snimi glas", en: "Record your voice" } as T,
    fajl: { sr: "Okači snimak", en: "Upload a recording" } as T,
  },
  talkText: { sr: "Šta Lik kaže", en: "What the character says" } as T,
  talkTextPlaceholder: {
    sr: "npr. Zdravo! Ja sam Maja i danas ti pokazujem kako se pravi najbolja kafa u gradu.",
    en: "e.g. Hi! I'm Maja and today I'll show you how to make the best coffee in town.",
  } as T,
  talkTextCount: { sr: "{n} / {max} znakova · ≈ {s} s govora", en: "{n} / {max} characters · ≈ {s} s of speech" } as T,
  talkVoiceName: { sr: "Glas (srpski, ElevenLabs v3)", en: "Voice (Serbian, ElevenLabs v3)" } as T,
  talkMicStart: { sr: "Snimaj glas", en: "Record your voice" } as T,
  talkMicStop: { sr: "Zaustavi", en: "Stop" } as T,
  talkMicRecording: { sr: "Snimam · {s} s", en: "Recording · {s} s" } as T,
  talkMicProblem: { sr: "Mikrofon nije dozvoljen ili ga nema.", en: "The microphone is not allowed or missing." } as T,
  talkAudioFile: { sr: "Izaberi snimak glasa (MP3, WAV, M4A)", en: "Choose a voice recording (MP3, WAV, M4A)" } as T,
  talkAudioBad: { sr: "To nije snimak koji primamo (MP3, WAV, M4A, WebM).", en: "That is not a recording we accept (MP3, WAV, M4A, WebM)." } as T,
  talkAudioLength: { sr: "Snimak: {s} s", en: "Recording: {s} s" } as T,
  talkRun: { sr: "Napravi", en: "Make it" } as T,
  talkTotal: { sr: "Ukupno unapred", en: "Total up front" } as T,
  talkSteps: {
    scena: { sr: "Scena (Nano Banana 2)", en: "Scene (Nano Banana 2)" } as T,
    glas: { sr: "Srpski glas", en: "Serbian voice" } as T,
    video: { sr: "Video koji govori (Kling)", en: "Talking video (Kling)" } as T,
  },
  talkEstimate: {
    sr: "Video se plaća po sekundi glasa; procena je iz dužine teksta. Ako glas ispadne primetno duži, pitamo te ponovo.",
    en: "The video is paid per second of voice; the estimate comes from the text length. If the voice turns out noticeably longer, we ask you again.",
  } as T,
  talkStatus: {
    idle: { sr: "čeka", en: "waiting" } as T,
    waiting: { sr: "radi…", en: "working…" } as T,
    done: { sr: "gotovo", en: "done" } as T,
    demo: { sr: "gotovo (DEMO)", en: "done (DEMO)" } as T,
    failed: { sr: "nije uspelo", en: "failed" } as T,
    skip: { sr: "ne treba", en: "not needed" } as T,
  },
  talkPriceChanged: {
    sr: "Glas traje {s} s, pa video košta {kr} (procena je bila {was}). Da nastavim?",
    en: "The voice lasts {s} s, so the video costs {kr} (the estimate was {was}). Shall I continue?",
  } as T,
  talkContinue: { sr: "Nastavi", en: "Continue" } as T,
  talkStop: { sr: "Ne, stani", en: "No, stop" } as T,
  talkDemoVoice: {
    sr: "DEMO: govor bez ključa nema pravi zvuk, pa za avatar ide probni zvuk iste dužine.",
    en: "DEMO: speech without a key has no real sound, so the avatar gets a sample sound of the same length.",
  } as T,
  talkDemoScene: {
    sr: "DEMO: scena bez ključa nema pravu sliku, pa govori fotka Lika.",
    en: "DEMO: a scene without a key has no real picture, so the character's photo talks.",
  } as T,
  talkFailed: { sr: "Korak „{step}\" nije uspeo. Krediti za njega se vraćaju sami.", en: "The step \"{step}\" failed. Its credits are returned automatically." } as T,
  talkAgain: { sr: "Kreni ispočetka", en: "Start over" } as T,
  talkDone: { sr: "Gotovo! Video je i u istoriji desno.", en: "Done! The video is also in the history on the right." } as T,
  talkTooLong: { sr: "Najviše 60 s - skrati tekst ili snimak.", en: "60 s at most - shorten the text or the recording." } as T,
  talkTooShort: { sr: "Snimak je prekratak (najmanje 1 s).", en: "The recording is too short (1 s at least)." } as T,
  talkNeedText: { sr: "Napiši šta Lik kaže.", en: "Write what the character says." } as T,
  talkNeedAudio: { sr: "Snimi ili okači glas.", en: "Record or upload a voice." } as T,
  talkNeedVideo: { sr: "Izaberi svoj video iz Cree.", en: "Pick your video from Crea." } as T,
  talkMascotSoon: { sr: "Govori i 3D maskota - uskoro.", en: "The 3D mascot talks too - coming soon." } as T,
};
