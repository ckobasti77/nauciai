import type { ChallengeGroup } from "./crea-challenges";
import type { LocalizedText, PluralForms } from "./i18n";

/**
 * Tekstovi zajednice Cree (K27): galerija i remiks (G8), dnevni izazov (G3), lige (G9),
 * kreativni par i pozivi (G10), deljeni stilovi (G11), sezone (G12) i moderacija.
 * Isti obrazac kao `lib/crea-game-copy.ts`; brojevi idu kroz `fillCopy`, množina kroz
 * `pluralize`.
 */

export const CREA_COMMUNITY_NAV = {
  gallery: { sr: "Galerija", en: "Gallery" },
  challenge: { sr: "Izazov", en: "Challenge" },
  notebook: { sr: "Sveska", en: "Notebook" },
  backToCrea: { sr: "Nazad u Creu", en: "Back to Crea" },
  community: { sr: "Zajednica Cree", en: "Crea community" },
  loading: { sr: "Učitavam…", en: "Loading…" },
  loadMore: { sr: "Učitaj još", en: "Load more" },
  copied: { sr: "Kopirano", en: "Copied" },
  copyLink: { sr: "Kopiraj link", en: "Copy link" },
  error: { sr: "Nešto nije uspelo. Probaj ponovo.", en: "Something went wrong. Try again." },
} satisfies Record<string, LocalizedText>;

export const CREA_REMIX_FORMS: Record<"sr" | "en", PluralForms> = {
  sr: { one: "verzija", few: "verzije", many: "verzija" },
  en: { one: "version", few: "versions", many: "versions" },
};

export const CREA_VOTE_FORMS: Record<"sr" | "en", PluralForms> = {
  sr: { one: "glas", few: "glasa", many: "glasova" },
  en: { one: "vote", few: "votes", many: "votes" },
};

export const CREA_GALLERY_COPY = {
  title: { sr: "Galerija Cree", en: "Crea gallery" },
  subtitle: {
    sr: "Radovi koje su ljudi sami podelili. Pogledaj, lajkuj i napravi svoju verziju - autor dobija zaslugu.",
    en: "Work people chose to share. Look, like and make your own version - the author gets the credit.",
  },
  tabs: { sr: "Delovi galerije", en: "Gallery sections" },
  tabNew: { sr: "Novo", en: "New" },
  tabPopular: { sr: "Popularno", en: "Popular" },
  tabStyles: { sr: "Stilovi", en: "Styles" },
  tabMine: { sr: "Moje objave", en: "My posts" },
  kindAll: { sr: "Sve", en: "All" },
  kindImage: { sr: "Slike", en: "Images" },
  kindVideo: { sr: "Video", en: "Video" },
  kindAudio: { sr: "Zvuk", en: "Sound" },
  kindFilter: { sr: "Vrsta rada", en: "Kind of work" },
  empty: {
    sr: "Još nema objavljenih radova. Budi prvi: otvori svoj rad u Crei i klikni „Objavi u galeriji“.",
    en: "Nothing shared yet. Be the first: open your work in Crea and click “Share to the gallery”.",
  },
  emptyMine: {
    sr: "Još ništa nisi objavio. Objavljuješ iz detalja svog rada u Crei.",
    en: "You have not shared anything yet. You share from your work's detail view in Crea.",
  },
  like: { sr: "Sviđa mi se", en: "Like" },
  unlike: { sr: "Poništi sviđanje", en: "Remove like" },
  likeCount: { sr: "{n} sviđanja", en: "{n} likes" },
  signInToLike: { sr: "Prijavi se da lajkuješ", en: "Sign in to like" },
  ownWork: { sr: "Tvoj rad", en: "Your work" },
  open: { sr: "Otvori rad: {title}", en: "Open work: {title}" },
  untitled: { sr: "Bez naslova", en: "Untitled" },
  statusPending: { sr: "Na proveri", en: "In review" },
  statusApproved: { sr: "Javno", en: "Public" },
  statusRejected: { sr: "Nije pušteno", en: "Not approved" },
  stylesEmpty: { sr: "Još nema podeljenih stilova.", en: "No shared styles yet." },
  stylesHint: {
    sr: "Stil je izbor izgleda koji je neko sačuvao. „Koristi stil“ ga stavi u tvoj opis - autor dobija mali kredit kad ti rad bude gotov.",
    en: "A style is a saved look someone shared. “Use style” adds it to your prompt - the author gets a small credit when your work is done.",
  },
  useStyle: { sr: "Koristi stil", en: "Use style" },
  styleUses: { sr: "Upotrebljen {n} puta", en: "Used {n} times" },
} satisfies Record<string, LocalizedText>;

export const CREA_WORK_COPY = {
  notFound: { sr: "Ovaj rad nije javan ili više ne postoji.", en: "This work is not public or no longer exists." },
  makeYours: { sr: "Napravi svoju verziju", en: "Make your own version" },
  tryTool: { sr: "Probaj ovaj alat", en: "Try this tool" },
  makeYoursHint: {
    sr: "Otvara Creu sa istim modelom{prompt}. Tuđ fajl se ne kopira - praviš od nule, a autor dobija zaslugu.",
    en: "Opens Crea with the same model{prompt}. The author's file is not copied - you start fresh and the author gets the credit.",
  },
  withPrompt: { sr: " i istim opisom", en: " and the same prompt" },
  prompt: { sr: "Opis (autor ga je podelio)", en: "Prompt (shared by the author)" },
  promptHidden: { sr: "Autor nije podelio opis.", en: "The author did not share the prompt." },
  copyPrompt: { sr: "Kopiraj opis", en: "Copy prompt" },
  madeWith: { sr: "Napravljeno sa: {model}", en: "Made with: {model}" },
  remixOf: { sr: "Nastalo od", en: "Made from" },
  remixTree: { sr: "Stablo verzija", en: "Version tree" },
  remixes: { sr: "Svoje verzije drugih", en: "Other people's versions" },
  remixesEmpty: { sr: "Još niko nije objavio svoju verziju.", en: "Nobody has shared their version yet." },
  pendingNote: { sr: "Čeka proveru - drugi ga još ne vide.", en: "Waiting for review - others cannot see it yet." },
  rejectedNote: { sr: "Provera ga nije pustila.", en: "Review did not approve it." },
  rejectedReason: { sr: "Razlog: {reason}", en: "Reason: {reason}" },
  challengeEntry: { sr: "Na izazovu: {theme}", en: "In the challenge: {theme}" },
} satisfies Record<string, LocalizedText>;

export const CREA_SHARE_COPY = {
  title: { sr: "Podeli sa zajednicom", en: "Share with the community" },
  body: {
    sr: "Rad ide u javnu galeriju tek posle provere. Opis deliš samo ako to izabereš.",
    en: "Your work goes into the public gallery only after review. You share the prompt only if you choose to.",
  },
  titleLabel: { sr: "Naslov (nije obavezan)", en: "Title (optional)" },
  titlePlaceholder: { sr: "npr. Lisica u magli", en: "e.g. Fox in the fog" },
  sharePrompt: { sr: "Podeli i opis", en: "Share the prompt too" },
  sharePromptHint: {
    sr: "Drugi tada mogu da naprave svoju verziju po tvom receptu, a ti dobijaš {n} kr kad im rad bude gotov (uz dnevni limit).",
    en: "Others can then make their own version from your recipe, and you get {n} credits when their work is done (daily limit applies).",
  },
  publish: { sr: "Objavi u galeriji", en: "Share to the gallery" },
  update: { sr: "Sačuvaj izmene", en: "Save changes" },
  enter: { sr: "Prijavi na današnji izazov", en: "Enter today's challenge" },
  enterHint: { sr: "Tema danas: {theme}. Prijava ide i u galeriju.", en: "Today's theme: {theme}. The entry also goes into the gallery." },
  notToday: { sr: "Na izazov ide samo rad napravljen danas.", en: "Only work made today can enter the challenge." },
  inChallenge: { sr: "Prijavljen na izazov", en: "Entered in the challenge" },
  withdraw: { sr: "Povuci iz galerije", en: "Remove from the gallery" },
  openPublic: { sr: "Otvori javnu stranicu", en: "Open the public page" },
  publishedPending: { sr: "Poslato na proveru.", en: "Sent for review." },
  likesAndVersions: { sr: "{likes} sviđanja · {versions}", en: "{likes} likes · {versions}" },
} satisfies Record<string, LocalizedText>;

/** Poruke grešaka zajednice (kodovi sa servera). Nepoznat kod = opšta poruka. */
export const CREA_COMMUNITY_ERRORS: Record<string, LocalizedText> = {
  GALERIJA_ISKLJUCENA: { sr: "Galerija još nije otvorena.", en: "The gallery is not open yet." },
  DNEVNI_LIMIT_OBJAVA: { sr: "Danas si objavio dovoljno - nastavi sutra.", en: "You have shared enough for today - continue tomorrow." },
  PREVISE_NA_CEKANJU: { sr: "Previše radova čeka proveru. Sačekaj da prođu.", en: "Too many works are waiting for review. Wait for them first." },
  NEPRIKLADAN_NASLOV: { sr: "Naslov ne može da prođe - promeni ga.", en: "That title cannot be used - change it." },
  PREDUG_NASLOV: { sr: "Naslov je predug (najviše 60 znakova).", en: "The title is too long (60 characters max)." },
  RAD_NIJE_OD_DANAS: { sr: "Na izazov ide samo rad napravljen danas.", en: "Only work made today can enter." },
  VEC_PRIJAVLJEN: { sr: "Danas si već prijavio drugi rad.", en: "You already entered another work today." },
  VEC_GLASAO: { sr: "Već si glasao u ovoj grupi.", en: "You already voted in this group." },
  SVOJ_RAD: { sr: "Za svoj rad ne možeš da glasaš (ni da ga lajkuješ).", en: "You cannot vote for (or like) your own work." },
  GLASANJE_ZATVORENO: { sr: "Glasanje za ovaj dan nije otvoreno.", en: "Voting for this day is not open." },
  GLAS_NIJE_DOZVOLJEN: { sr: "Glasaju samo nalozi sa potvrđenim emailom.", en: "Only accounts with a confirmed email can vote." },
  NALOG_SUSPENDOVAN: { sr: "Nalog je privremeno suspendovan.", en: "The account is temporarily suspended." },
  RAD_NIJE_JAVAN: { sr: "Rad više nije javan.", en: "The work is no longer public." },
  NEPRIKLADAN_STIL: { sr: "Ovaj stil ne može da se podeli - promeni ime ili dodatak.", en: "This style cannot be shared - change its name or extra." },
  POZIV_NE_POSTOJI: { sr: "Ovaj poziv ne postoji.", en: "This invite does not exist." },
  SVOJ_POZIV: { sr: "Ovo je tvoj link - pošalji ga prijatelju.", en: "This is your own link - send it to a friend." },
  LIGA_NIJE_DOSTUPNA: { sr: "Osoblje nije u ligama.", en: "Staff are not in leagues." },
};

export function communityErrorText(error: unknown, locale: "sr" | "en"): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = Object.keys(CREA_COMMUNITY_ERRORS).find((key) => message.includes(key));
  return code ? CREA_COMMUNITY_ERRORS[code]![locale] : CREA_COMMUNITY_NAV.error[locale];
}

export const CREA_CHALLENGE_GROUP_LABEL: Record<ChallengeGroup, LocalizedText> = {
  pocetnici: { sr: "Početnici", en: "Beginners" },
  svi: { sr: "Svi", en: "Everyone" },
};

export const CREA_CHALLENGE_COPY = {
  title: { sr: "Dnevni izazov", en: "Daily challenge" },
  subtitle: {
    sr: "Svaki dan nova tema. Danas praviš, sutra se glasa, a prekosutra pobednik grupe dobija bedž i {n} kredita.",
    en: "A new theme every day. Make it today, vote tomorrow - the day after, each group's winner gets a badge and {n} credits.",
  },
  todayKicker: { sr: "Tema danas", en: "Today's theme" },
  groupsHint: {
    sr: "Do 500 XP-a si u grupi „Početnici“ - takmičiš se sa onima koji su tek počeli. Rad može biti plaćen ili besplatan; kredit ne daje prednost.",
    en: "Up to 500 XP you are in the “Beginners” group - you compete with people who just started. Work can be paid or free; credits give no edge.",
  },
  myGroup: { sr: "Tvoja grupa: {group}", en: "Your group: {group}" },
  enterTitle: { sr: "Prijavi rad od danas", en: "Enter a work from today" },
  enterHint: { sr: "Izaberi jedan rad. Prijava ide na proveru i u galeriju.", en: "Pick one work. The entry is reviewed and also goes into the gallery." },
  noWorksToday: { sr: "Danas još nisi ništa napravio. Napravi nešto na temu, pa se vrati ovde.", en: "You have not made anything today. Make something on the theme, then come back." },
  makeInCrea: { sr: "Napravi u Crei", en: "Make it in Crea" },
  pick: { sr: "Prijavi ovaj rad", en: "Enter this work" },
  myEntry: { sr: "Tvoja prijava", en: "Your entry" },
  entryPending: { sr: "Čeka proveru - posle ide na glasanje sutra.", en: "Waiting for review - then it goes to tomorrow's vote." },
  entryApproved: { sr: "Puštena - sutra se glasa.", en: "Approved - voting is tomorrow." },
  votingTitle: { sr: "Glasanje", en: "Voting" },
  votingTheme: { sr: "Jučerašnja tema: {theme}", en: "Yesterday's theme: {theme}" },
  votingHint: { sr: "Jedan glas po grupi. Za svoj rad ne možeš da glasaš. Broj glasova se vidi tek u rezultatima.", en: "One vote per group. You cannot vote for your own work. Vote counts show only in the results." },
  vote: { sr: "Glasaj", en: "Vote" },
  voteFor: { sr: "Glasaj za: {title}", en: "Vote for: {title}" },
  yourVote: { sr: "Tvoj glas", en: "Your vote" },
  votingEmpty: { sr: "U ovoj grupi juče nije bilo puštenih prijava.", en: "No approved entries in this group yesterday." },
  resultsTitle: { sr: "Pobednici", en: "Winners" },
  resultsTheme: { sr: "Tema: {theme}", en: "Theme: {theme}" },
  resultsPending: { sr: "Rezultati stižu u toku dana.", en: "Results arrive later today." },
  MALO_PRIJAVA: { sr: "Premalo prijava za pobednika.", en: "Too few entries for a winner." },
  MALO_GLASOVA: { sr: "Niko nije skupio dovoljno glasova.", en: "Nobody got enough votes." },
  winner: { sr: "Pobednik", en: "Winner" },
  entries: { sr: "{n} prijava · {votes}", en: "{n} entries · {votes}" },
  badges: { sr: "Moji bedževi", en: "My badges" },
  badgesEmpty: { sr: "Pobedi na izazovu i bedž stiže ovde.", en: "Win a challenge and your badge lands here." },
  badge: { sr: "Pobednik · {theme}", en: "Winner · {theme}" },
  signIn: { sr: "Prijavi se da učestvuješ i glasaš.", en: "Sign in to take part and vote." },
} satisfies Record<string, LocalizedText>;

export const CREA_SEASON_COPY = {
  kicker: { sr: "Tematska nedelja", en: "Theme week" },
  preview: { sr: "Pregled sezone", en: "Season preview" },
  stickers: { sr: "Sezonske nalepnice su u editoru i montaži.", en: "Seasonal stickers are in the editor and montage." },
} satisfies Record<string, LocalizedText>;

export const CREA_LEAGUE_COPY = {
  title: { sr: "Nedeljna liga", en: "Weekly league" },
  subtitle: {
    sr: "Liga se bira po tvojoj aktivnosti: XP prošle nedelje određuje ligu, XP ove nedelje mesto u grupi. Krediti se ne računaju.",
    en: "Your league follows your activity: last week's XP picks the league, this week's XP your place in the group. Credits do not count.",
  },
  join: { sr: "Uđi u ligu ove nedelje", en: "Join this week's league" },
  joinHint: { sr: "U ligu ulaziš i sam, prvim radom ove nedelje. Ušao bi u ligu {tier}.", en: "You also join on your own with your first work this week. You would join the {tier} league." },
  league: { sr: "Liga {tier}", en: "{tier} league" },
  group: { sr: "grupa {n}", en: "group {n}" },
  myXp: { sr: "Ove nedelje: {n} XP", en: "This week: {n} XP" },
  nextTier: { sr: "Sa ovoliko XP-a sledeće nedelje ideš u ligu {tier}.", en: "With this XP you go to the {tier} league next week." },
  table: { sr: "Tabela grupe", en: "Group table" },
  rank: { sr: "Mesto", en: "Place" },
  name: { sr: "Ime", en: "Name" },
  xp: { sr: "XP", en: "XP" },
  you: { sr: "ti", en: "you" },
  podium: { sr: "Postolje", en: "Podium" },
  lastWeek: { sr: "Prošle nedelje: {rank}. mesto u ligi {tier}.", en: "Last week: place {rank} in the {tier} league." },
  staff: { sr: "Osoblje nije u ligama (kao ni na rang-listi).", en: "Staff are not in leagues (nor on the leaderboard)." },
  tiers: { sr: "Lige: olovka → bojica → flomaster → četkica → pero.", en: "Leagues: pencil → crayon → marker → brush → fountain pen." },
} satisfies Record<string, LocalizedText>;

export const CREA_PAIR_COPY = {
  title: { sr: "Kreativni par", en: "Creative pair" },
  subtitle: {
    sr: "Pozovi prijatelja. Svaki dan kad oboje uradite lekciju ili rad, vaš zajednički niz raste.",
    en: "Invite a friend. Every day you both do a lesson or a work, your shared streak grows.",
  },
  inviteTitle: { sr: "Tvoj link za poziv", en: "Your invite link" },
  makeLink: { sr: "Napravi link za poziv", en: "Create invite link" },
  partner: { sr: "Tvoj par: {name}", en: "Your pair: {name}" },
  since: { sr: "zajedno od {date}", en: "together since {date}" },
  sharedStreak: { sr: "Zajednički niz: {n} d.", en: "Shared streak: {n} d." },
  meToday: { sr: "Ti danas", en: "You today" },
  partnerToday: { sr: "{name} danas", en: "{name} today" },
  done: { sr: "urađeno", en: "done" },
  notYet: { sr: "još nije", en: "not yet" },
  leave: { sr: "Raskini par", en: "End the pair" },
  leaveConfirm: { sr: "Sigurno? Zajednički niz prestaje (poziv i nagrada ostaju).", en: "Sure? The shared streak stops (the invite and reward stay)." },
  cancel: { sr: "Odustani", en: "Cancel" },
  noPair: { sr: "Još nemaš par. Pošalji link prijatelju - kad ga prihvati, postajete par.", en: "No pair yet. Send the link to a friend - once they accept, you are a pair." },
  invitesTitle: { sr: "Pozvani prijatelji", en: "Invited friends" },
  rewardRule: {
    sr: "Kad nov prijatelj završi prvu lekciju i prvi rad, dobijaš {n} kr (najviše {max} nagrade mesečno). Kupovina se ne računa.",
    en: "When a new friend finishes their first lesson and first work, you get {n} credits (up to {max} rewards a month). Purchases do not count.",
  },
  noInvites: { sr: "Još nikoga nisi pozvao.", en: "You have not invited anyone yet." },
  firstLesson: { sr: "Prva lekcija", en: "First lesson" },
  firstWork: { sr: "Prvi rad", en: "First work" },
  claim: { sr: "Preuzmi {n} kr", en: "Claim {n} credits" },
  claimed: { sr: "Preuzeto: {n} kr", en: "Claimed: {n} credits" },
  NIJE_NOV_NALOG: { sr: "Nalog nije bio nov - važi samo par, bez nagrade.", en: "Not a new account - the pair counts, no reward." },
  PRIJATELJ_NIJE_ZAVRSIO: { sr: "Čeka se prva lekcija i prvi rad.", en: "Waiting for the first lesson and first work." },
  MESECNI_LIMIT: { sr: "Ovog meseca si preuzeo sve nagrade - nastavi sledećeg.", en: "You claimed all rewards this month - continue next month." },
  VEC_PREUZETO: { sr: "Već preuzeto.", en: "Already claimed." },
  EMAIL_NIJE_POTVRDJEN: { sr: "Nagrada traži potvrđen email (tvoj i prijateljev).", en: "The reward needs a confirmed email (yours and your friend's)." },
  DUPLIRAN_EMAIL: { sr: "Nagrada ne važi za drugi nalog iz istog sandučeta.", en: "The reward does not apply to another account from the same inbox." },
  NALOG_NEDOSTUPAN: { sr: "Nalog nije dostupan.", en: "The account is not available." },
} satisfies Record<string, LocalizedText>;

export const CREA_INVITE_COPY = {
  title: { sr: "{name} te zove u Creu", en: "{name} invites you to Crea" },
  body: {
    sr: "U Crei od jedne rečenice praviš sliku, video ili zvuk - i usput učiš kako AI radi. Prihvati poziv i postanite kreativni par: svaki dan kad oboje nešto uradite, zajednički niz raste.",
    en: "In Crea one sentence becomes an image, a video or a sound - and you learn how AI works along the way. Accept and become a creative pair: every day you both make something, your shared streak grows.",
  },
  accept: { sr: "Prihvati poziv", en: "Accept the invite" },
  signUp: { sr: "Uđi ili napravi nalog", en: "Sign in or create an account" },
  accepted: { sr: "Gotovo! Sad ste kreativni par.", en: "Done! You are now a creative pair." },
  acceptedNoPair: { sr: "Poziv je zabeležen. Par ne nastaje dok neko od vas već ima drugi par.", en: "Invite recorded. A pair is not formed while one of you already has another pair." },
  isInviter: { sr: "Ovo je tvoj link - pošalji ga prijatelju.", en: "This is your own link - send it to a friend." },
  pairedTogether: { sr: "Već ste par.", en: "You are already a pair." },
  hasOtherPair: { sr: "Već imaš par. Raskini ga u svesci ako želiš novi.", en: "You already have a pair. End it in the notebook if you want a new one." },
  inviterHasOtherPair: { sr: "{name} trenutno ima drugi par - poziv se ipak beleži.", en: "{name} currently has another pair - the invite is still recorded." },
  openNotebook: { sr: "Otvori svesku", en: "Open the notebook" },
  notFound: { sr: "Ovaj poziv ne postoji ili više ne važi.", en: "This invite does not exist or is no longer valid." },
} satisfies Record<string, LocalizedText>;

export const CREA_MODERATION_COPY = {
  views: { sr: "Šta pregledaš", en: "What you review" },
  jobs: { sr: "Svi poslovi", en: "All jobs" },
  works: { sr: "Javni radovi", en: "Public works" },
  styles: { sr: "Deljeni stilovi", en: "Shared styles" },
  pending: { sr: "Na čekanju", en: "Pending" },
  approved: { sr: "Pušteni", en: "Approved" },
  rejected: { sr: "Odbijeni", en: "Rejected" },
  approve: { sr: "Pusti", en: "Approve" },
  reject: { sr: "Odbij", en: "Reject" },
  takeDown: { sr: "Skini", en: "Take down" },
  reason: { sr: "Razlog (vidi ga samo autor)", en: "Reason (only the author sees it)" },
  empty: { sr: "Ovde ništa ne čeka.", en: "Nothing waiting here." },
  sharedPrompt: { sr: "Podeljen opis", en: "Shared prompt" },
  challenge: { sr: "Izazov {day}", en: "Challenge {day}" },
  galleryOff: {
    sr: "Galerija je isključena (fleg `crea_public_gallery`): korisnici ne mogu da objavljuju, a javno se ništa ne vidi.",
    en: "The gallery is switched off (flag `crea_public_gallery`): users cannot share and nothing is public.",
  },
} satisfies Record<string, LocalizedText>;

export const CREA_REF_COPY = {
  remix: { sr: "Praviš svoju verziju rada „{title}“ · {author}", en: "Making your own version of “{title}” · {author}" },
  remixUntitled: { sr: "Praviš svoju verziju rada · {author}", en: "Making your own version of a work by {author}" },
  remixHint: { sr: "Autor dobija zaslugu kad tvoj rad bude gotov.", en: "The author gets the credit when your work is done." },
  style: { sr: "Koristiš stil „{name}“ · {author}", en: "Using the style “{name}” · {author}" },
  styleHint: { sr: "Promeniš li izgled, zasluga za stil otpada.", en: "If you change the look, the style credit is dropped." },
  remove: { sr: "Ukloni", en: "Remove" },
} satisfies Record<string, LocalizedText>;

export const CREA_STYLE_SHARE_COPY = {
  share: { sr: "Podeli sa zajednicom", en: "Share with the community" },
  unshare: { sr: "Vrati u privatne", en: "Make private" },
  pending: { sr: "na proveri", en: "in review" },
  approved: { sr: "deli se", en: "shared" },
  rejected: { sr: "nije pušten", en: "not approved" },
  uses: { sr: "{n} upotreba", en: "{n} uses" },
} satisfies Record<string, LocalizedText>;
