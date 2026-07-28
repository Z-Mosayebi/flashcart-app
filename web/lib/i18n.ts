/**
 * Interface localisation (EN/DE).
 *
 * Note this covers UI *chrome* only — card content and tutor conversation are
 * always German, since that's the thing being learned. Explanations may come
 * back in the learner's interface language.
 */

export type Locale = "en" | "de";

export const LOCALES: Locale[] = ["en", "de"];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
};

const en = {
  "nav.review": "Review",
  "nav.tutor": "Tutor",
  "nav.dashboard": "Dashboard",
  "nav.signIn": "Sign in",
  "nav.signOut": "Sign out",
  "nav.settings": "Settings",

  "landing.tagline": "Speak German you can actually produce",
  "landing.subtitle":
    "Turn your own notes into spoken flashcards, and practise with a tutor that keeps asking until the grammar sticks.",
  "landing.cta": "Start learning free",
  "landing.ctaSecondary": "I already have an account",
  "landing.feature1.title": "Hear every card",
  "landing.feature1.body":
    "Each prompt is read aloud in German so you train your ear and your pronunciation together, not just your reading.",
  "landing.feature2.title": "A tutor, not a quiz",
  "landing.feature2.body":
    "Answer in your own words. You get real feedback on word order, cases and article choice — then a harder question.",
  "landing.feature3.title": "Reviews timed for you",
  "landing.feature3.body":
    "Spaced repetition that watches how hard you struggled, not just whether you were right, and brings cards back accordingly.",

  "review.title": "Review",
  "review.loading": "Loading your cards…",
  "review.empty.title": "All caught up",
  "review.empty.body": "Nothing is due right now. Come back later, or start a tutor session.",
  "review.empty.cta": "Practise with the tutor",
  "review.placeholder": "Type your answer in German…",
  "review.submit": "Check answer",
  "review.checking": "Checking…",
  "review.next": "Next card",
  "review.showHint": "Show hint",
  "review.hideHint": "Hide hint",
  "review.remaining": "{count} left",
  "review.listen": "Listen",
  "review.correct": "Correct",
  "review.partial": "Almost",
  "review.incorrect": "Not quite",
  "review.expected": "Expected answer",
  "review.sessionComplete": "Session complete",
  "review.reviewed": "{count} cards reviewed",
  "review.accuracy": "{percent}% correct",
  "review.again": "Review more",

  "tutor.title": "Tutor",
  "tutor.subtitle": "Pick a topic and practise producing it until it's automatic.",
  "tutor.chooseTopic": "Choose a topic",
  "tutor.start": "Start session",
  "tutor.placeholder": "Write your answer in German…",
  "tutor.send": "Send",
  "tutor.thinking": "Tutor is thinking…",
  "tutor.mastered.title": "Mastered",
  "tutor.mastered.body": "You produced this pattern correctly several times in a row.",
  "tutor.newSession": "New session",
  "tutor.back": "Back to topics",
  "tutor.noTopics": "No topics yet. Sync your notes to get started.",

  "dashboard.title": "Progress",
  "dashboard.mastery": "Mastery",
  "dashboard.accuracy": "Accuracy",
  "dashboard.dueToday": "Due today",
  "dashboard.totalCards": "Total cards",
  "dashboard.streak": "Day streak",
  "dashboard.boxes": "Leitner boxes",
  "dashboard.box": "Box {n}",
  "dashboard.recentMistakes": "Recent mistakes",
  "dashboard.noMistakes": "No mistakes recorded yet.",
  "dashboard.startReview": "Start reviewing",
  "dashboard.empty.title": "No cards yet",
  "dashboard.empty.body": "Once your notes are synced, your deck and progress appear here.",

  "settings.title": "Settings",
  "settings.language": "Interface language",
  "settings.languageHint": "Cards and tutor conversation stay in German.",
  "settings.theme": "Appearance",
  "settings.theme.light": "Light",
  "settings.theme.dark": "Dark",
  "settings.theme.system": "System",
  "settings.audio": "Card audio",
  "settings.audioAuto": "Play German audio automatically",
  "settings.audioHint": "Reads each card prompt aloud when it appears.",
  "settings.save": "Save changes",
  "settings.saved": "Saved",

  "auth.signIn.title": "Welcome back",
  "auth.signIn.subtitle": "Sign in to pick up where you left off.",
  "auth.signUp.title": "Create your account",
  "auth.signUp.subtitle": "Free to start. No card required.",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.name": "Name",
  "auth.signInCta": "Sign in",
  "auth.signUpCta": "Create account",
  "auth.toSignUp": "New here? Create an account",
  "auth.toSignIn": "Already have an account? Sign in",
  "auth.google": "Continue with Google",
  "auth.or": "or",
  "auth.error.invalid": "That email or password isn't right.",
  "auth.error.exists": "An account with that email already exists.",
  "auth.error.generic": "Something went wrong. Please try again.",
  "auth.error.weakPassword": "Password must be at least 8 characters.",
  "auth.error.server": "We couldn't reach the server. Please try again in a moment.",

  "auth.forgot.link": "Forgot your password?",
  "auth.forgot.title": "Reset your password",
  "auth.forgot.subtitle":
    "Enter your email and we'll send you a link to choose a new password.",
  "auth.forgot.cta": "Send reset link",
  "auth.forgot.sent.title": "Check your email",
  "auth.forgot.sent.body":
    "If an account exists for {email}, a reset link is on its way. It expires in an hour.",
  "auth.forgot.back": "Back to sign in",

  "auth.reset.title": "Choose a new password",
  "auth.reset.subtitle": "Pick something you haven't used here before.",
  "auth.reset.password": "New password",
  "auth.reset.confirm": "Confirm new password",
  "auth.reset.cta": "Save new password",
  "auth.reset.checking": "Checking your link…",
  "auth.reset.mismatch": "Those passwords don't match.",
  "auth.reset.invalid.title": "This link doesn't work",
  "auth.reset.invalid.body":
    "It may have expired or already been used. Request a new one to continue.",
  "auth.reset.invalid.cta": "Request a new link",
  "auth.reset.done.title": "Password updated",
  "auth.reset.done.body": "You can now sign in with your new password.",

  "notion.title": "Your notes",
  "notion.subtitle":
    "Connect a Notion page and Flashcart turns it into cards. Sync again any time you add notes — only new content is processed.",
  "notion.token": "Notion integration token",
  "notion.tokenHint": "Create one at notion.so/my-integrations, then share your page with it.",
  "notion.pageUrl": "Notion page URL",
  "notion.help.toggle": "How do I get a token?",
  "notion.help.step1": "Open notion.so/my-integrations and click <b>New integration</b>.",
  "notion.help.step2":
    "Give it any name, pick your workspace, and submit. Copy the <b>Internal Integration Secret</b> — it starts with <code>ntn_</code> or <code>secret_</code>.",
  "notion.help.step3":
    "Open the Notion page you want to use. Click <b>•••</b> (top right) → <b>Connections</b> → <b>Connect to</b> → pick your integration.",
  "notion.help.step4": "Copy the page URL from your browser and paste both below.",
  "notion.help.warning":
    "Step 3 is the one people miss — without it Notion reports the page as not found.",
  "notion.help.open": "Open Notion integrations",
  "notion.connect": "Connect",
  "notion.connected": "Connected",
  "notion.disconnect": "Disconnect",
  "notion.sync": "Sync now",
  "notion.syncing": "Syncing… this can take a minute",
  "notion.lastSynced": "Last synced {when}",
  "notion.never": "Not synced yet",
  "notion.cardsAdded": "{count} new cards added",
  "notion.upToDate": "Already up to date",
  "notion.error.token": "Enter your integration token.",
  "notion.error.page": "That doesn't look like a Notion page URL.",
  "notion.error.generic": "Couldn't reach Notion. Check the token and that the page is shared.",
  "notion.oauth.connect": "Connect Notion",
  "notion.oauth.hint": "You'll pick which pages to share on Notion's own screen.",
  "notion.oauth.cancelled": "Connection cancelled.",
  "notion.oauth.failed": "Couldn't connect to Notion. Please try again.",
  "notion.oauth.notConfigured": "Notion sign-in isn't set up on this server yet.",
  "notion.pages.title": "Pages to sync",
  "notion.pages.empty": "No pages shared yet. Reconnect and select at least one page.",
  "notion.pages.save": "Save selection",
  "notion.pages.none": "Select at least one page, then sync.",
  "notion.advanced": "Use an integration token instead",
  "notion.advanced.hide": "Back to one-click connect",

  "common.error": "Something went wrong.",
  "common.retry": "Try again",
  "common.loading": "Loading…",
  "common.close": "Close",
} as const;

export type TranslationKey = keyof typeof en;

const de: Record<TranslationKey, string> = {
  "nav.review": "Wiederholen",
  "nav.tutor": "Tutor",
  "nav.dashboard": "Übersicht",
  "nav.signIn": "Anmelden",
  "nav.signOut": "Abmelden",
  "nav.settings": "Einstellungen",

  "landing.tagline": "Deutsch, das du wirklich selbst bilden kannst",
  "landing.subtitle":
    "Mach aus deinen eigenen Notizen gesprochene Karteikarten und übe mit einem Tutor, der so lange nachfragt, bis die Grammatik sitzt.",
  "landing.cta": "Kostenlos starten",
  "landing.ctaSecondary": "Ich habe schon ein Konto",
  "landing.feature1.title": "Jede Karte hören",
  "landing.feature1.body":
    "Jede Aufgabe wird auf Deutsch vorgelesen — so trainierst du Gehör und Aussprache mit, nicht nur das Lesen.",
  "landing.feature2.title": "Ein Tutor, kein Quiz",
  "landing.feature2.body":
    "Antworte in eigenen Worten. Du bekommst echtes Feedback zu Wortstellung, Kasus und Artikeln — und dann eine schwerere Frage.",
  "landing.feature3.title": "Wiederholungen im richtigen Moment",
  "landing.feature3.body":
    "Verteiltes Lernen, das erkennt, wie schwer du dich getan hast — nicht nur, ob es richtig war — und Karten entsprechend zurückbringt.",

  "review.title": "Wiederholen",
  "review.loading": "Deine Karten werden geladen…",
  "review.empty.title": "Alles erledigt",
  "review.empty.body": "Im Moment ist nichts fällig. Schau später wieder vorbei oder starte eine Tutor-Sitzung.",
  "review.empty.cta": "Mit dem Tutor üben",
  "review.placeholder": "Antwort auf Deutsch eingeben…",
  "review.submit": "Antwort prüfen",
  "review.checking": "Wird geprüft…",
  "review.next": "Nächste Karte",
  "review.showHint": "Hinweis zeigen",
  "review.hideHint": "Hinweis verbergen",
  "review.remaining": "noch {count}",
  "review.listen": "Anhören",
  "review.correct": "Richtig",
  "review.partial": "Fast",
  "review.incorrect": "Nicht ganz",
  "review.expected": "Erwartete Antwort",
  "review.sessionComplete": "Sitzung abgeschlossen",
  "review.reviewed": "{count} Karten wiederholt",
  "review.accuracy": "{percent}% richtig",
  "review.again": "Weiter üben",

  "tutor.title": "Tutor",
  "tutor.subtitle": "Wähle ein Thema und übe es, bis es automatisch sitzt.",
  "tutor.chooseTopic": "Thema wählen",
  "tutor.start": "Sitzung starten",
  "tutor.placeholder": "Antwort auf Deutsch schreiben…",
  "tutor.send": "Senden",
  "tutor.thinking": "Tutor denkt nach…",
  "tutor.mastered.title": "Gemeistert",
  "tutor.mastered.body": "Du hast dieses Muster mehrmals hintereinander korrekt gebildet.",
  "tutor.newSession": "Neue Sitzung",
  "tutor.back": "Zurück zu den Themen",
  "tutor.noTopics": "Noch keine Themen. Synchronisiere deine Notizen, um zu beginnen.",

  "dashboard.title": "Fortschritt",
  "dashboard.mastery": "Beherrschung",
  "dashboard.accuracy": "Trefferquote",
  "dashboard.dueToday": "Heute fällig",
  "dashboard.totalCards": "Karten gesamt",
  "dashboard.streak": "Tage in Folge",
  "dashboard.boxes": "Leitner-Fächer",
  "dashboard.box": "Fach {n}",
  "dashboard.recentMistakes": "Letzte Fehler",
  "dashboard.noMistakes": "Noch keine Fehler erfasst.",
  "dashboard.startReview": "Wiederholung starten",
  "dashboard.empty.title": "Noch keine Karten",
  "dashboard.empty.body": "Sobald deine Notizen synchronisiert sind, erscheinen hier Deck und Fortschritt.",

  "settings.title": "Einstellungen",
  "settings.language": "Sprache der Oberfläche",
  "settings.languageHint": "Karten und Tutor-Gespräch bleiben auf Deutsch.",
  "settings.theme": "Darstellung",
  "settings.theme.light": "Hell",
  "settings.theme.dark": "Dunkel",
  "settings.theme.system": "System",
  "settings.audio": "Karten-Audio",
  "settings.audioAuto": "Deutsches Audio automatisch abspielen",
  "settings.audioHint": "Liest jede Karte vor, sobald sie erscheint.",
  "settings.save": "Änderungen speichern",
  "settings.saved": "Gespeichert",

  "auth.signIn.title": "Willkommen zurück",
  "auth.signIn.subtitle": "Melde dich an und mach dort weiter, wo du aufgehört hast.",
  "auth.signUp.title": "Konto erstellen",
  "auth.signUp.subtitle": "Kostenlos starten. Keine Karte nötig.",
  "auth.email": "E-Mail",
  "auth.password": "Passwort",
  "auth.name": "Name",
  "auth.signInCta": "Anmelden",
  "auth.signUpCta": "Konto erstellen",
  "auth.toSignUp": "Neu hier? Konto erstellen",
  "auth.toSignIn": "Schon ein Konto? Anmelden",
  "auth.google": "Weiter mit Google",
  "auth.or": "oder",
  "auth.error.invalid": "E-Mail oder Passwort stimmt nicht.",
  "auth.error.exists": "Mit dieser E-Mail existiert bereits ein Konto.",
  "auth.error.generic": "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
  "auth.error.weakPassword": "Das Passwort muss mindestens 8 Zeichen haben.",
  "auth.error.server": "Der Server war nicht erreichbar. Bitte versuche es gleich noch einmal.",

  "auth.forgot.link": "Passwort vergessen?",
  "auth.forgot.title": "Passwort zurücksetzen",
  "auth.forgot.subtitle":
    "Gib deine E-Mail ein und wir schicken dir einen Link für ein neues Passwort.",
  "auth.forgot.cta": "Link senden",
  "auth.forgot.sent.title": "Schau in dein Postfach",
  "auth.forgot.sent.body":
    "Falls es ein Konto für {email} gibt, ist ein Link unterwegs. Er gilt eine Stunde.",
  "auth.forgot.back": "Zurück zur Anmeldung",

  "auth.reset.title": "Neues Passwort wählen",
  "auth.reset.subtitle": "Nimm eines, das du hier noch nicht verwendet hast.",
  "auth.reset.password": "Neues Passwort",
  "auth.reset.confirm": "Neues Passwort bestätigen",
  "auth.reset.cta": "Passwort speichern",
  "auth.reset.checking": "Dein Link wird geprüft…",
  "auth.reset.mismatch": "Die Passwörter stimmen nicht überein.",
  "auth.reset.invalid.title": "Dieser Link funktioniert nicht",
  "auth.reset.invalid.body":
    "Er ist vermutlich abgelaufen oder wurde schon benutzt. Fordere einen neuen an.",
  "auth.reset.invalid.cta": "Neuen Link anfordern",
  "auth.reset.done.title": "Passwort aktualisiert",
  "auth.reset.done.body": "Du kannst dich jetzt mit deinem neuen Passwort anmelden.",

  "notion.title": "Deine Notizen",
  "notion.subtitle":
    "Verbinde eine Notion-Seite und Flashcart macht daraus Karten. Synchronisiere erneut, wenn du Notizen ergänzt — nur Neues wird verarbeitet.",
  "notion.token": "Notion-Integrations-Token",
  "notion.tokenHint": "Erstelle eines auf notion.so/my-integrations und teile deine Seite damit.",
  "notion.pageUrl": "URL der Notion-Seite",
  "notion.help.toggle": "Wie bekomme ich ein Token?",
  "notion.help.step1":
    "Öffne notion.so/my-integrations und klicke auf <b>New integration</b>.",
  "notion.help.step2":
    "Vergib einen Namen, wähle deinen Workspace und bestätige. Kopiere das <b>Internal Integration Secret</b> — es beginnt mit <code>ntn_</code> oder <code>secret_</code>.",
  "notion.help.step3":
    "Öffne die gewünschte Notion-Seite. Klicke oben rechts auf <b>•••</b> → <b>Verbindungen</b> → <b>Verbinden mit</b> → wähle deine Integration.",
  "notion.help.step4": "Kopiere die Seiten-URL aus dem Browser und füge beides unten ein.",
  "notion.help.warning":
    "Schritt 3 wird am häufigsten übersehen — ohne ihn meldet Notion die Seite als nicht gefunden.",
  "notion.help.open": "Notion-Integrationen öffnen",
  "notion.connect": "Verbinden",
  "notion.connected": "Verbunden",
  "notion.disconnect": "Trennen",
  "notion.sync": "Jetzt synchronisieren",
  "notion.syncing": "Wird synchronisiert… das kann eine Minute dauern",
  "notion.lastSynced": "Zuletzt synchronisiert {when}",
  "notion.never": "Noch nicht synchronisiert",
  "notion.cardsAdded": "{count} neue Karten hinzugefügt",
  "notion.upToDate": "Bereits aktuell",
  "notion.error.token": "Gib dein Integrations-Token ein.",
  "notion.error.page": "Das sieht nicht nach einer Notion-Seiten-URL aus.",
  "notion.error.generic":
    "Notion nicht erreichbar. Prüfe das Token und ob die Seite geteilt ist.",
  "notion.oauth.connect": "Notion verbinden",
  "notion.oauth.hint": "Du wählst direkt bei Notion aus, welche Seiten geteilt werden.",
  "notion.oauth.cancelled": "Verbindung abgebrochen.",
  "notion.oauth.failed": "Verbindung zu Notion fehlgeschlagen. Bitte erneut versuchen.",
  "notion.oauth.notConfigured": "Notion-Anmeldung ist auf diesem Server noch nicht eingerichtet.",
  "notion.pages.title": "Zu synchronisierende Seiten",
  "notion.pages.empty": "Noch keine Seiten geteilt. Verbinde erneut und wähle mindestens eine Seite.",
  "notion.pages.save": "Auswahl speichern",
  "notion.pages.none": "Wähle mindestens eine Seite und synchronisiere dann.",
  "notion.advanced": "Stattdessen ein Integrations-Token verwenden",
  "notion.advanced.hide": "Zurück zur Ein-Klick-Verbindung",

  "common.error": "Etwas ist schiefgelaufen.",
  "common.retry": "Erneut versuchen",
  "common.loading": "Wird geladen…",
  "common.close": "Schließen",
};

const dictionaries: Record<Locale, Record<TranslationKey, string>> = { en, de };

/**
 * Looks up a key and interpolates {placeholders}.
 * Falls back to English, then to the key itself, so a missing translation
 * degrades to readable text instead of blanking the UI.
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  vars?: Record<string, string | number>
): string {
  const template = dictionaries[locale]?.[key] ?? dictionaries.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    name in vars ? String(vars[name]) : match
  );
}

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "de";
}
