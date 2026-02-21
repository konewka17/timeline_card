const TRANSLATIONS = {
    en: {
        allDay: "all day",
        minuteShort: "min",
        hourShort: "h",
        moving: "Moving",
        noHistory: "No location history for this day.",
        loading: "Loading timeline...",
    },
    de: {
        allDay: "ganztägig",
        minuteShort: "Min",
        hourShort: "Std",
        moving: "Unterwegs",
        noHistory: "Kein Standortverlauf für diesen Tag.",
        loading: "Zeitachse wird geladen...",
    },
    nl: {
        allDay: "hele dag",
        minuteShort: "min",
        hourShort: "u",
        moving: "Onderweg",
        noHistory: "Geen locatiegeschiedenis voor deze dag.",
        loading: "Tijdlijn laden...",
    },
};

function normalizeLanguageTag(language) {
    if (!language || typeof language !== "string") return "en";
    return language.toLowerCase();
}

export function createLocalizationContext(config = {}, hass = null) {
    const requestedLanguage = normalizeLanguageTag(
        config.locale || hass?.locale?.language || hass?.language || navigator.language || "en",
    );

    const [baseLanguage] = requestedLanguage.split("-");
    const dictionary = TRANSLATIONS[requestedLanguage] || TRANSLATIONS[baseLanguage] || TRANSLATIONS.en;

    return {
        language: requestedLanguage,
        dictionary,
        timeDisplay: config.time_display || "auto",
    };
}

export function t(ctx, key) {
    return ctx?.dictionary?.[key] || TRANSLATIONS.en[key] || key;
}

