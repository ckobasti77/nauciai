import type { LocalizedText } from "./i18n";

/**
 * „Dok čekaš, nauči" (K25, U6): savet od 20 sekundi ili jedno kviz pitanje na ekranu
 * čekanja. Sadržaj je na srpskom (en prevod za `/en`) i govori samo o stvarima koje
 * Crea zaista ima. Kviz NE daje XP (vidi ODLUKE K25 u `docs/CREA-PROGRESS.md`): pitanje
 * se pojavljuje samo dok se čeka plaćen rad, a XP se nikad ne vezuje za potrošene kredite (G1).
 */

export type CreaTipArea = "slika" | "video" | "zvuk";

export type CreaTip = { id: string; area?: CreaTipArea; text: LocalizedText };

export type CreaQuiz = {
  id: string;
  area?: CreaTipArea;
  question: LocalizedText;
  options: readonly LocalizedText[];
  /** Indeks tačnog odgovora u `options`. */
  answer: number;
  /** Jedna rečenica posle odgovora: zašto je tako. */
  why: LocalizedText;
};

export const CREA_TIPS: readonly CreaTip[] = [
  { id: "delovi", text: { sr: "Dobar opis ima pet delova: ko je na slici, šta radi, u kom stilu, kakvo je svetlo i odakle gleda kamera.", en: "A good description has five parts: who is in it, what they do, the style, the light and where the camera looks from." } },
  { id: "pomocnik", area: "slika", text: { sr: "Ne znaš kako da opišeš? „Pomoćnik za opis\" od tvoje ideje na srpskom napravi precizan opis po delovima - besplatno.", en: "Not sure how to describe it? The \"Prompt helper\" turns your idea into a precise description, part by part - free." } },
  { id: "konkretno", text: { sr: "Konkretno pobeđuje opšte: umesto „lep pas\" napiši „zlatni retriver trči po mokrom pesku\".", en: "Concrete beats general: instead of \"a nice dog\" write \"a golden retriever running on wet sand\"." } },
  { id: "sta-zelis", text: { sr: "Piši šta želiš da vidiš, a ne šta ne želiš: „prazna ulica u zoru\" radi bolje od „ulica bez ljudi\".", en: "Write what you want to see, not what you don't: \"an empty street at dawn\" works better than \"a street with no people\"." } },
  { id: "format", text: { sr: "Format biraš po mestu objave: 9:16 za TikTok i priče, 1:1 za Instagram objavu, 16:9 za YouTube.", en: "Pick the shape by where you post: 9:16 for TikTok and stories, 1:1 for an Instagram post, 16:9 for YouTube." } },
  { id: "natpis", area: "slika", text: { sr: "Tačan natpis na slici stavi pod navodnike, npr. natpis „Kafić Kod Mike\". Modeli tako bolje prepišu slova.", en: "Put exact on-image text in quotes, e.g. the sign \"Mika's Café\". Models copy the letters better that way." } },
  { id: "zlatni-sat", area: "slika", text: { sr: "„Zlatni sat\" (golden hour) u opisu daje toplu, meku svetlost kao pred zalazak sunca.", en: "\"Golden hour\" in a description gives warm, soft light like just before sunset." } },
  { id: "objektiv", area: "slika", text: { sr: "Objektiv menja utisak: 85 mm za lep portret sa mutnom pozadinom, širokougaoni za prostor i pejzaž.", en: "The lens changes the feel: 85 mm for a flattering portrait with a blurred background, wide angle for rooms and landscapes." } },
  { id: "probni-list", area: "slika", text: { sr: "Probni list napravi više jeftinih skica odjednom. Izabereš najbolju i samo nju usavršiš skupljim modelom.", en: "The draft sheet makes several cheap sketches at once. You pick the best one and refine only that with a pricier model." } },
  { id: "varijacije", area: "slika", text: { sr: "Varijacije ×2-4 daju više verzija istog opisa. Cena na dugmetu je već ukupna za sve.", en: "Variations ×2-4 give several versions of one description. The price on the button already covers all of them." } },
  { id: "izgled", area: "slika", text: { sr: "U „Izgledu\" biraš stil, kameru i paletu klikom - Crea ih sama doda opisu, a ti vidiš tačan tekst pre slanja.", en: "In \"Look\" you pick a style, camera and palette with a click - Crea adds them to the description and shows you the exact text first." } },
  { id: "lik", text: { sr: "Sačuvaj sebe kao Lik i pomeni ga sa @ u opisu - ista osoba će izgledati isto na više slika i videa.", en: "Save yourself as a Character and mention it with @ - the same person stays consistent across images and videos." } },
  { id: "pristanak", text: { sr: "U Lik ide samo tvoje lice. Tuđe lice ili glas bez dozvole se ne koriste - ni u šali.", en: "Only your own face goes into a Character. Someone else's face or voice is never used without permission - not even as a joke." } },
  { id: "besplatni-alati", text: { sr: "Mnogi alati rade na tvom uređaju za 0 kredita: uklanjanje pozadine, isecanje, promena formata, provera fotke.", en: "Many tools run on your device for 0 credits: background removal, cropping, format change, photo check." } },
  { id: "povracaj", text: { sr: "Kad posao ne uspe, krediti ti se sami vrate. Ne moraš nikome da pišeš.", en: "When a job fails, your credits come back on their own. You don't need to contact anyone." } },
  { id: "cena-na-dugmetu", text: { sr: "Tačna cena uvek piše na dugmetu pre nego što klikneš. Promeni model ili kvalitet i cena se odmah osveži.", en: "The exact price is always on the button before you click. Change the model or quality and it updates right away." } },
  { id: "verzije", text: { sr: "Svaka izmena pamti od čega je nastala. „Vrati prethodnu\" te vraća korak unazad, a ništa se ne briše.", en: "Every edit remembers what it came from. \"Go back\" returns you one step, and nothing gets deleted." } },
  { id: "kao-ulaz", text: { sr: "Gotov rad može odmah dalje: „Koristi kao ulaz\" ga šalje u izmenu, animaciju ili alat.", en: "A finished work can go straight on: \"Use as input\" sends it to editing, animation or a tool." } },
  { id: "kako-je", text: { sr: "U detalju svakog rada piše „Kako je ovo napravljeno?\" - opis po bojama, model i podešavanja. Odličan način da učiš.", en: "Every work's detail shows \"How was this made?\" - the description by colour, the model and settings. A great way to learn." } },
  { id: "biblioteka", text: { sr: "U Biblioteci tražiš radove rečima na srpskom, i latinicom i ćirilicom. Srcem označi omiljene.", en: "In the Library you search your works in plain words, Latin or Cyrillic script. Mark favourites with the heart." } },
  { id: "preuzmi", text: { sr: "Gotovi fajlovi se čuvaju ograničeno vreme. Ono što ti treba za posao preuzmi na svoj uređaj.", en: "Finished files are kept for a limited time. Download what you need for work to your own device." } },
  { id: "mikrofon", text: { sr: "Ne voliš da kucaš? Klikni mikrofon pored polja i izgovori opis - prepoznavanje radi tvoj pregledač.", en: "Don't like typing? Click the microphone next to the box and say your description - your browser does the recognition." } },
  { id: "video-kamera", area: "video", text: { sr: "U videu opiši i pokret: šta radi kamera („polako prilazi\") i ko se kreće („devojka se okreće ka nama\").", en: "In a video describe the motion too: what the camera does (\"slowly moves closer\") and who moves (\"a girl turns towards us\")." } },
  { id: "video-proba", area: "video", text: { sr: "Video je skuplji od slike. Prvo napravi kratku probu, pa tek kad ti se sviđa, dužu i bolju verziju.", en: "Video costs more than an image. Make a short test first, and only when you like it, a longer, better version." } },
  { id: "video-kadrovi", area: "video", text: { sr: "Daš li početni i završni kadar, model izmisli pokret između njih - zgodno za „pre i posle\".", en: "Give a start and an end frame and the model invents the motion between them - handy for \"before and after\"." } },
  { id: "video-jedna-radnja", area: "video", text: { sr: "Kratak video najbolje nosi jednu radnju. Za priču sa više scena napravi više kadrova i spoji ih u montaži.", en: "A short video carries one action best. For a story with several scenes, make several shots and join them in the editor." } },
  { id: "glas-interpunkcija", area: "zvuk", text: { sr: "Glas čita i znakove: zarez je kratka pauza, tačka duža, a upitnik podiže ton. Iskoristi ih.", en: "The voice reads punctuation too: a comma is a short pause, a full stop a longer one, and a question mark lifts the tone." } },
  { id: "glas-brojevi", area: "zvuk", text: { sr: "Brojeve i skraćenice napiši onako kako treba da se izgovore: „dvadeset posto\", a ne „20%\".", en: "Write numbers and abbreviations the way they should be spoken: \"twenty percent\", not \"20%\"." } },
  { id: "muzika-opis", area: "zvuk", text: { sr: "Za muziku navedi žanr, tempo, instrumente i raspoloženje: „mirni lo-fi, klavir i bubnjevi, 80 udaraca u minuti\".", en: "For music name the genre, tempo, instruments and mood: \"calm lo-fi, piano and drums, 80 beats per minute\"." } },
  { id: "efekti-opis", area: "zvuk", text: { sr: "Zvučni efekat opiši kao da ga čuješ: „koraci po snegu, sporo, izbliza\" daje bolji zvuk od „koraci\".", en: "Describe a sound effect as if you hear it: \"footsteps in snow, slow, close up\" sounds better than \"footsteps\"." } },
  { id: "glasnoca", area: "zvuk", text: { sr: "Za objavu na mrežama u Uređivaču zvuka izaberi „Za mreže\" - glasnoća će biti kao kod ostalih snimaka.", en: "For social posts pick \"For social\" in the Sound editor - the loudness will match other clips." } },
];

export const CREA_QUIZZES: readonly CreaQuiz[] = [
  {
    id: "q-format", question: { sr: "Praviš video za TikTok. Koji format biraš?", en: "You're making a TikTok video. Which shape do you pick?" },
    options: [{ sr: "9:16 (uspravno)", en: "9:16 (portrait)" }, { sr: "16:9 (položeno)", en: "16:9 (landscape)" }, { sr: "1:1 (kvadrat)", en: "1:1 (square)" }],
    answer: 0, why: { sr: "TikTok i priče se gledaju na uspravnom telefonu, pa 9:16 popuni ceo ekran.", en: "TikTok and stories are watched on an upright phone, so 9:16 fills the whole screen." },
  },
  {
    id: "q-povracaj", question: { sr: "Šta se desi sa kreditima kad posao ne uspe?", en: "What happens to your credits when a job fails?" },
    options: [{ sr: "Sami se vrate", en: "They come back on their own" }, { sr: "Izgube se", en: "They are lost" }, { sr: "Vrati se pola", en: "Half comes back" }],
    answer: 0, why: { sr: "Neuspeo posao se ne naplaćuje - krediti se vraćaju automatski.", en: "A failed job isn't charged - credits are returned automatically." },
  },
  {
    id: "q-probni-list", area: "slika", question: { sr: "Koji je najjeftiniji način da nađeš dobru ideju za sliku?", en: "What's the cheapest way to find a good idea for an image?" },
    options: [{ sr: "Probni list sa skicama", en: "A draft sheet of sketches" }, { sr: "Odmah najskuplji model u 4K", en: "The priciest model in 4K right away" }, { sr: "Ista slika deset puta", en: "The same image ten times" }],
    answer: 0, why: { sr: "Skice su jeftine; usavršiš samo onu koja ti se dopadne.", en: "Sketches are cheap; you refine only the one you like." },
  },
  {
    id: "q-lik", question: { sr: "Kako da ista osoba izgleda isto na više slika?", en: "How do you keep the same person consistent across images?" },
    options: [{ sr: "Sačuvaš je kao Lik", en: "Save them as a Character" }, { sr: "Promeniš model", en: "Switch models" }, { sr: "Napišeš kraći opis", en: "Write a shorter description" }],
    answer: 0, why: { sr: "Lik nosi fotke osobe u svaki rad, pa model zna koga crta.", en: "A Character carries the person's photos into each work, so the model knows who to draw." },
  },
  {
    id: "q-objektiv", area: "slika", question: { sr: "Šta znači „85 mm\" u opisu slike?", en: "What does \"85 mm\" mean in an image description?" },
    options: [{ sr: "Objektiv za portret", en: "A portrait lens" }, { sr: "Veličina fajla", en: "The file size" }, { sr: "Dužina videa", en: "The video length" }],
    answer: 0, why: { sr: "85 mm je klasičan portretni objektiv: lepo lice i mutna pozadina.", en: "85 mm is the classic portrait lens: a flattering face and a blurred background." },
  },
  {
    id: "q-besplatno", question: { sr: "Koliko košta uklanjanje pozadine na tvom uređaju?", en: "How much does background removal on your device cost?" },
    options: [{ sr: "0 kredita", en: "0 credits" }, { sr: "10 kredita", en: "10 credits" }, { sr: "Zavisi od slike", en: "It depends on the image" }],
    answer: 0, why: { sr: "Alati sa oznakom „Na tvom uređaju\" rade u tvom pregledaču i ne troše kredite.", en: "Tools marked \"On your device\" run in your browser and use no credits." },
  },
  {
    id: "q-natpis", area: "slika", question: { sr: "Želiš tačan natpis na plakatu. Kako ga pišeš u opisu?", en: "You want exact text on a poster. How do you write it in the description?" },
    options: [{ sr: "Pod navodnicima", en: "In quotes" }, { sr: "Sve velikim slovima", en: "All in capitals" }, { sr: "Na kraju, bez navodnika", en: "At the end, without quotes" }],
    answer: 0, why: { sr: "Navodnici kažu modelu da su to slova koja treba prepisati, a ne deo opisa.", en: "Quotes tell the model these are letters to copy, not part of the description." },
  },
  {
    id: "q-pokret", area: "video", question: { sr: "Šta je najvažnije dodati u opis videa?", en: "What matters most to add to a video description?" },
    options: [{ sr: "Pokret kamere i ko se kreće", en: "Camera motion and who moves" }, { sr: "Samo boje", en: "Only the colours" }, { sr: "Naslov videa", en: "The video title" }],
    answer: 0, why: { sr: "Video je pokret: bez njega model često napravi skoro mirnu sliku.", en: "Video is motion: without it the model often makes an almost still picture." },
  },
  {
    id: "q-lice", question: { sr: "Čije lice sme da ide u tvoj Lik?", en: "Whose face may go into your Character?" },
    options: [{ sr: "Samo tvoje", en: "Only yours" }, { sr: "Bilo koje sa interneta", en: "Any from the internet" }, { sr: "Lice poznate osobe", en: "A celebrity's face" }],
    answer: 0, why: { sr: "Crea pravi likove samo od tvog lica, uz tvoj pristanak.", en: "Crea builds characters only from your own face, with your consent." },
  },
  {
    id: "q-svetlo", area: "slika", question: { sr: "Šta „zlatni sat\" (golden hour) daje slici?", en: "What does \"golden hour\" give an image?" },
    options: [{ sr: "Toplu, meku svetlost", en: "Warm, soft light" }, { sr: "Noćnu scenu", en: "A night scene" }, { sr: "Crno-belu sliku", en: "A black-and-white image" }],
    answer: 0, why: { sr: "To je svetlo pred zalazak sunca: toplo, meko i sa dugim senkama.", en: "It's the light before sunset: warm, soft and with long shadows." },
  },
  {
    id: "q-cena", question: { sr: "Gde vidiš cenu pre nego što platiš?", en: "Where do you see the price before you pay?" },
    options: [{ sr: "Na dugmetu „Generiši\"", en: "On the \"Generate\" button" }, { sr: "Tek na računu", en: "Only on the invoice" }, { sr: "Posle gotovog rada", en: "After the work is done" }],
    answer: 0, why: { sr: "Dugme uvek nosi tačnu cenu, pa znaš koliko košta pre klika.", en: "The button always shows the exact price, so you know the cost before you click." },
  },
  {
    id: "q-glas", area: "zvuk", question: { sr: "Kako da glas napravi kratku pauzu usred rečenice?", en: "How do you get the voice to pause briefly mid-sentence?" },
    options: [{ sr: "Stavi zarez", en: "Add a comma" }, { sr: "Napiši „pauza\"", en: "Write \"pause\"" }, { sr: "Dodaj razmake", en: "Add extra spaces" }],
    answer: 0, why: { sr: "Glas čita interpunkciju: zarez je kratka pauza, tačka duža.", en: "The voice reads punctuation: a comma is a short pause, a full stop a longer one." },
  },
];

export type CreaLearnCard = { type: "tip"; tip: CreaTip } | { type: "quiz"; quiz: CreaQuiz };

/** Stabilan broj iz niza (FNV-1a), da svako čekanje krene od drugog saveta, ali isto posle osvežavanja. */
export function seedFrom(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Redosled kartica za jedno čekanje: prvo saveti i pitanja za tu oblast pa opšti,
 * svaka treća kartica je kviz. `seed` (npr. id posla) bira odakle se kreće.
 */
export function learnDeck(area: CreaTipArea, seed: number): CreaLearnCard[] {
  const fits = <T extends { area?: CreaTipArea }>(item: T) => item.area === undefined || item.area === area;
  const rotate = <T,>(items: T[]) => (items.length ? [...items.slice(seed % items.length), ...items.slice(0, seed % items.length)] : items);
  const tips = rotate(CREA_TIPS.filter(fits));
  const quizzes = rotate(CREA_QUIZZES.filter(fits));
  const deck: CreaLearnCard[] = [];
  let quizIndex = 0;
  for (const tip of tips) {
    deck.push({ type: "tip", tip });
    if (deck.length % 3 === 2 && quizIndex < quizzes.length) deck.push({ type: "quiz", quiz: quizzes[quizIndex++]! });
  }
  return deck;
}

/** Oblast saveta za vrstu rada. */
export function tipAreaFor(kind: "image" | "video" | "audio"): CreaTipArea {
  return kind === "video" ? "video" : kind === "audio" ? "zvuk" : "slika";
}
