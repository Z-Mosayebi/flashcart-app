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
  "review.partial": "Almost there!",
  "review.incorrect": "Try it again",
  "review.progress": "{done} done · {left} left",
  "review.tagExplanation": "What this mistake means",
  "review.showAnswerLabel": "Here's how it goes",
  "review.tryAgain": "Try again",
  "review.showAnswer": "Show answer",
  "review.secondTry": "Second try — use this feedback",
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
  "auth.error.blocked": "This account has been disabled. Contact info@parastoomosayebi.de if you think this is a mistake.",
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

  "drive.title": "Your notes",
  "drive.subtitle":
    "Pick a document from your Google Drive and Flashcard turns it into cards. Import again any time you add notes — only what changed is processed.",
  "drive.supported": "Google Docs, Word documents, Sheets and Excel files.",

  "drive.notConnected.title": "Google Drive isn't connected",
  "drive.notConnected.body":
    "Sign in with Google to let Flashcard read your notes. It only ever reads — your files are never changed.",
  "drive.notConnected.cta": "Sign in with Google",
  "drive.notAvailable": "Importing from Drive isn't set up on this server yet.",

  "drive.picker.open": "Choose from Drive",
  "drive.picker.title": "Choose a document",
  "drive.picker.search": "Search your Drive",
  "drive.picker.empty": "No documents found.",
  "drive.picker.emptySearch": "Nothing matched “{query}”.",
  "drive.picker.loading": "Loading your documents…",
  "drive.picker.selected": "{count} selected",
  "drive.picker.import": "Import",
  "drive.picker.cancel": "Cancel",
  "drive.picker.urlHint": "Or paste a Drive link",
  "drive.picker.urlInvalid": "That doesn't look like a Google Drive link.",

  "drive.documents.title": "Imported documents",
  "drive.documents.empty": "No documents yet.",
  "drive.documents.topics": "{count} topics",
  "drive.documents.remove": "Remove",
  "drive.documents.reimport": "Import again",
  "drive.documents.legacy": "Imported from Notion. Cards are kept, but it can't be imported again.",

  "drive.status.pending": "Waiting to start",
  "drive.status.importing": "Importing {done} of {total} sections",
  "drive.status.importingStart": "Reading your document…",
  "drive.status.complete": "Imported {when}",
  "drive.status.failed": "Import failed",
  "drive.status.never": "Not imported yet",

  "drive.import.started": "Importing. You can leave this page — it keeps going.",
  "drive.import.done": "{count} new cards added",
  "drive.import.unchanged": "Already up to date",
  "drive.import.partial": "{count} new cards. Some sections couldn't be processed.",
  "drive.error.unauthorized": "Flashcard lost access to your Drive. Sign in with Google again.",
  "drive.error.generic": "Couldn't reach Google Drive. Try again in a moment.",

  "drive.disconnect": "Revoke Drive access",
  "drive.disconnect.hint": "Your cards stay — only Flashcard's access to Drive is removed.",

  "nav.admin": "Admin",

  "plan.free": "Free plan",
  "plan.premiumUntil": "Premium until {date}",
  "plan.admin": "Admin · no limits",
  "plan.documents": "{used} of {limit} documents",
  "plan.daily": "{graded} graded answers and {tutor} tutor replies a day",
  "plan.getMore": "Get more with Premium",
  "plan.pending": "Your premium request is being reviewed.",

  "usage.today": "Today {used} / {limit}",

  "limit.graded": "You've used all {limit} graded answers for today.",
  "limit.tutor": "You've used all {limit} tutor replies for today.",
  "limit.documents": "Your plan includes {limit} document(s), and you've used them.",
  "limit.body": "Want more? Request a free premium trial and we'll activate it for you.",
  "limit.cta": "Request premium",
  "limit.pending": "Your premium request is being reviewed — we'll email you when it's active.",
  "limit.resets": "Free limits reset at midnight, your time.",

  "upload.title": "Upload from your computer",
  "upload.subtitle": "Excel (.xlsx, .csv) or notes (.docx, .txt, .md), up to 2 MB.",
  "upload.choose": "Choose a file",
  "upload.working": "Reading {name} and making cards…",
  "upload.done": "{count} new cards added from {name}",
  "upload.unchanged": "{name} was already imported",
  "upload.failed": "Couldn't import {name}: {reason}",
  "upload.tooLarge": "That file is larger than 2 MB.",

  "drive.documents.uploaded": "Uploaded from your computer",
  "drive.documents.continue": "Continue",

  "premium.title": "Request Premium",
  "premium.subtitle":
    "Premium is free while we test it. Tell us a little about how you learn, and we'll activate a trial for you.",
  "premium.goal": "Why are you learning German?",
  "premium.goal.EXAM": "Exam (Goethe, telc…)",
  "premium.goal.WORK": "Work",
  "premium.goal.IMMIGRATION": "Moving to a German-speaking country",
  "premium.goal.STUDY": "Study",
  "premium.goal.PERSONAL": "Personal interest",
  "premium.goal.OTHER": "Something else",
  "premium.level": "Your German level now",
  "premium.level.UNKNOWN": "Not sure",
  "premium.pay": "If Premium were paid, what would you pay per month?",
  "premium.pay.NOTHING": "Nothing — only if it's free",
  "premium.pay.UNDER_5": "Under €5",
  "premium.pay.FROM_5_TO_10": "€5–10",
  "premium.pay.OVER_10": "More than €10",
  "premium.contact": "Telegram username or phone (optional)",
  "premium.contactHint": "Only so we can reach you. Never shown to anyone else.",
  "premium.message": "Anything else? (optional)",
  "premium.submit": "Send request",
  "premium.sending": "Sending…",
  "premium.sent": "Thanks! Your request is in. We'll email you when your trial is active.",
  "premium.status.PENDING": "Your request is being reviewed.",
  "premium.status.APPROVED": "Premium is active until {date}.",
  "premium.status.REJECTED": "Your last request wasn't approved. You can send a new one.",

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
  "review.partial": "Fast geschafft!",
  "review.incorrect": "Versuch's nochmal",
  "review.progress": "{done} erledigt · noch {left}",
  "review.tagExplanation": "Was dieser Fehler bedeutet",
  "review.showAnswerLabel": "So geht's",
  "review.tryAgain": "Nochmal versuchen",
  "review.showAnswer": "Antwort zeigen",
  "review.secondTry": "Zweiter Versuch — nutze dieses Feedback",
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
  "auth.error.blocked": "Dieses Konto wurde deaktiviert. Schreib an info@parastoomosayebi.de, wenn du das für einen Fehler hältst.",
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

  "drive.title": "Deine Notizen",
  "drive.subtitle":
    "Wähle ein Dokument aus deinem Google Drive und Flashcard macht Karten daraus. Importiere jederzeit erneut — nur Änderungen werden verarbeitet.",
  "drive.supported": "Google Docs, Word-Dokumente, Sheets und Excel-Dateien.",

  "drive.notConnected.title": "Google Drive ist nicht verbunden",
  "drive.notConnected.body":
    "Melde dich mit Google an, damit Flashcard deine Notizen lesen kann. Es wird ausschließlich gelesen — deine Dateien werden nie geändert.",
  "drive.notConnected.cta": "Mit Google anmelden",
  "drive.notAvailable": "Der Import aus Drive ist auf diesem Server noch nicht eingerichtet.",

  "drive.picker.open": "Aus Drive wählen",
  "drive.picker.title": "Dokument wählen",
  "drive.picker.search": "Drive durchsuchen",
  "drive.picker.empty": "Keine Dokumente gefunden.",
  "drive.picker.emptySearch": "Nichts gefunden für „{query}“.",
  "drive.picker.loading": "Deine Dokumente werden geladen…",
  "drive.picker.selected": "{count} ausgewählt",
  "drive.picker.import": "Importieren",
  "drive.picker.cancel": "Abbrechen",
  "drive.picker.urlHint": "Oder einen Drive-Link einfügen",
  "drive.picker.urlInvalid": "Das sieht nicht nach einem Google-Drive-Link aus.",

  "drive.documents.title": "Importierte Dokumente",
  "drive.documents.empty": "Noch keine Dokumente.",
  "drive.documents.topics": "{count} Themen",
  "drive.documents.remove": "Entfernen",
  "drive.documents.reimport": "Erneut importieren",
  "drive.documents.legacy": "Aus Notion importiert. Die Karten bleiben, ein erneuter Import ist nicht möglich.",

  "drive.status.pending": "Wartet auf den Start",
  "drive.status.importing": "Importiere Abschnitt {done} von {total}",
  "drive.status.importingStart": "Dein Dokument wird gelesen…",
  "drive.status.complete": "Importiert {when}",
  "drive.status.failed": "Import fehlgeschlagen",
  "drive.status.never": "Noch nicht importiert",

  "drive.import.started": "Import läuft. Du kannst die Seite verlassen — er läuft weiter.",
  "drive.import.done": "{count} neue Karten hinzugefügt",
  "drive.import.unchanged": "Bereits aktuell",
  "drive.import.partial": "{count} neue Karten. Einige Abschnitte konnten nicht verarbeitet werden.",
  "drive.error.unauthorized": "Flashcard hat den Zugriff auf dein Drive verloren. Melde dich erneut mit Google an.",
  "drive.error.generic": "Google Drive war nicht erreichbar. Versuche es gleich noch einmal.",

  "drive.disconnect": "Drive-Zugriff entziehen",
  "drive.disconnect.hint": "Deine Karten bleiben — nur der Zugriff von Flashcard auf Drive wird entfernt.",

  "nav.admin": "Admin",

  "plan.free": "Kostenloser Plan",
  "plan.premiumUntil": "Premium bis {date}",
  "plan.admin": "Admin · ohne Limits",
  "plan.documents": "{used} von {limit} Dokumenten",
  "plan.daily": "{graded} bewertete Antworten und {tutor} Tutor-Antworten pro Tag",
  "plan.getMore": "Mehr mit Premium",
  "plan.pending": "Deine Premium-Anfrage wird geprüft.",

  "usage.today": "Heute {used} / {limit}",

  "limit.graded": "Du hast heute alle {limit} bewerteten Antworten genutzt.",
  "limit.tutor": "Du hast heute alle {limit} Tutor-Antworten genutzt.",
  "limit.documents": "Dein Plan umfasst {limit} Dokument(e), und du hast sie genutzt.",
  "limit.body": "Mehr gewünscht? Fordere eine kostenlose Premium-Testphase an — wir schalten sie für dich frei.",
  "limit.cta": "Premium anfragen",
  "limit.pending": "Deine Premium-Anfrage wird geprüft — wir schreiben dir, sobald sie aktiv ist.",
  "limit.resets": "Die kostenlosen Limits werden um Mitternacht (deine Ortszeit) zurückgesetzt.",

  "upload.title": "Vom Computer hochladen",
  "upload.subtitle": "Excel (.xlsx, .csv) oder Notizen (.docx, .txt, .md), bis 2 MB.",
  "upload.choose": "Datei auswählen",
  "upload.working": "{name} wird gelesen und in Karten verwandelt…",
  "upload.done": "{count} neue Karten aus {name} hinzugefügt",
  "upload.unchanged": "{name} wurde bereits importiert",
  "upload.failed": "{name} konnte nicht importiert werden: {reason}",
  "upload.tooLarge": "Diese Datei ist größer als 2 MB.",

  "drive.documents.uploaded": "Vom Computer hochgeladen",
  "drive.documents.continue": "Fortsetzen",

  "premium.title": "Premium anfragen",
  "premium.subtitle":
    "Premium ist kostenlos, solange wir es testen. Erzähl uns kurz, wie du lernst, und wir schalten eine Testphase für dich frei.",
  "premium.goal": "Warum lernst du Deutsch?",
  "premium.goal.EXAM": "Prüfung (Goethe, telc…)",
  "premium.goal.WORK": "Beruf",
  "premium.goal.IMMIGRATION": "Umzug in ein deutschsprachiges Land",
  "premium.goal.STUDY": "Studium",
  "premium.goal.PERSONAL": "Persönliches Interesse",
  "premium.goal.OTHER": "Etwas anderes",
  "premium.level": "Dein aktuelles Deutschniveau",
  "premium.level.UNKNOWN": "Weiß nicht",
  "premium.pay": "Wenn Premium kostenpflichtig wäre: Wie viel würdest du pro Monat zahlen?",
  "premium.pay.NOTHING": "Nichts — nur wenn es kostenlos ist",
  "premium.pay.UNDER_5": "Unter 5 €",
  "premium.pay.FROM_5_TO_10": "5–10 €",
  "premium.pay.OVER_10": "Mehr als 10 €",
  "premium.contact": "Telegram-Name oder Telefon (optional)",
  "premium.contactHint": "Nur damit wir dich erreichen können. Wird niemandem sonst gezeigt.",
  "premium.message": "Sonst noch etwas? (optional)",
  "premium.submit": "Anfrage senden",
  "premium.sending": "Wird gesendet…",
  "premium.sent": "Danke! Deine Anfrage ist da. Wir schreiben dir, sobald deine Testphase aktiv ist.",
  "premium.status.PENDING": "Deine Anfrage wird geprüft.",
  "premium.status.APPROVED": "Premium ist aktiv bis {date}.",
  "premium.status.REJECTED": "Deine letzte Anfrage wurde nicht freigegeben. Du kannst eine neue senden.",

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
