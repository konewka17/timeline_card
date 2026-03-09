import en from "./languages/en.json";
import nl from "./languages/nl.json";

const languages = {en, nl};

export function localize(string, search = "", replace = "") {
    let lang = (localStorage.getItem("selectedLanguage"))?.replace(/['"]+/g, "").replace("-", "_");
    if (!lang) {
        const _hass = document.querySelector("home-assistant").hass
        lang = _hass.selectedLanguage || _hass.language || _hass.locale?.language || "en";
    }

    let translated;
    try {
        translated = string.split(".").reduce((o, i) => o[i], languages[lang]);
    } catch (e) {
        translated = string.split(".").reduce((o, i) => o[i], languages.en);
    }

    if (translated === undefined) translated = string.split(".").reduce((o, i) => o[i], languages.en);

    if (search !== "" && replace !== "") {
        translated = translated.replace(search, replace);
    }
    return translated;
}
