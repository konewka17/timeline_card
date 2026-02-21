const OPTIONS = {
    places_entity: null,
    stay_radius_m: 75,
    min_stay_minutes: 10,
    show_debug: false,
};

class TimelineCardEditor extends HTMLElement {
    setConfig(config) {
        this._config = {...OPTIONS, ...config};
        this._render();
    }

    set hass(hass) {
        this._hass = hass;
        this._render();
    }

    _render() {
        if (!this._config || !this._hass) return;
        if (!this.shadowRoot) {
            this.attachShadow({mode: "open"});
        }

        this.shadowRoot.innerHTML = "";

        const style = document.createElement("style");
        style.textContent = `
      :host { display: block; }
      .form { display: grid; gap: 12px; }
      ha-textfield { display: block; }
    `;
        this.shadowRoot.appendChild(style);

        const form = document.createElement("div");
        form.className = "form";

        const entityPicker = document.createElement("ha-entity-picker");
        entityPicker.setAttribute("label", "Tracked entity");
        entityPicker.hass = this._hass;
        entityPicker.value = this._config.entity || "";
        entityPicker.includeDomains = ["device_tracker", "person"];
        entityPicker.addEventListener("value-changed", this._onEntityChanged.bind(this));

        const stayRadius = document.createElement("ha-textfield");
        stayRadius.setAttribute("label", "Stay radius (meters)");
        stayRadius.setAttribute("type", "number");
        stayRadius.setAttribute("min", "10");
        stayRadius.setAttribute("step", "5");
        stayRadius.value = String(this._config.stay_radius_m ?? OPTIONS.stay_radius_m);
        stayRadius.addEventListener("input", (ev) => this._onNumberChanged("stay_radius_m", ev));

        const minStay = document.createElement("ha-textfield");
        minStay.setAttribute("label", "Minimum stay duration (minutes)");
        minStay.setAttribute("type", "number");
        minStay.setAttribute("min", "1");
        minStay.setAttribute("step", "1");
        minStay.value = String(this._config.min_stay_minutes ?? OPTIONS.min_stay_minutes);
        minStay.addEventListener("input", (ev) => this._onNumberChanged("min_stay_minutes", ev));

        const placesPicker = document.createElement("ha-entity-picker");
        placesPicker.setAttribute("label", "Places entity (optional)");
        placesPicker.hass = this._hass;
        placesPicker.value = this._config.places_entity || "";
        placesPicker.includeDomains = ["sensor"];
        placesPicker.addEventListener("value-changed", (ev) => this._onEntityFieldChanged("places_entity", ev));

        const debugRow = document.createElement("label");
        debugRow.style.display = "flex";
        debugRow.style.alignItems = "center";
        debugRow.style.justifyContent = "space-between";
        debugRow.style.gap = "12px";
        debugRow.textContent = "Show debug";

        const debugToggle = document.createElement("ha-switch");
        debugToggle.checked = Boolean(this._config.show_debug ?? OPTIONS.show_debug);
        debugToggle.addEventListener("change", (ev) => this._onToggleChanged("show_debug", ev));
        debugRow.appendChild(debugToggle);

        form.appendChild(entityPicker);
        form.appendChild(placesPicker);
        form.appendChild(stayRadius);
        form.appendChild(minStay);
        form.appendChild(debugRow);
        this.shadowRoot.appendChild(form);
    }

    _onEntityChanged(ev) {
        const value = ev?.detail?.value || "";
        this._config = {...this._config, entity: value};
        this._emitChange();
    }

    _onEntityFieldChanged(key, ev) {
        const value = ev?.detail?.value || "";
        this._config = {...this._config, [key]: value || null};
        this._emitChange();
    }

    _onNumberChanged(key, ev) {
        const value = Number(ev.target.value);
        if (!Number.isFinite(value)) return;
        this._config = {...this._config, [key]: value};
        this._emitChange();
    }

    _onToggleChanged(key, ev) {
        this._config = {...this._config, [key]: Boolean(ev.target.checked)};
        this._emitChange();
    }

    _emitChange() {
        this.dispatchEvent(
            new CustomEvent("config-changed", {
                detail: {config: this._config},
                bubbles: true,
                composed: true,
            })
        );
    }
}

customElements.define("location-timeline-card-editor", TimelineCardEditor);
