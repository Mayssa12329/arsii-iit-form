/* =========================================================
   Club ARSII IIT – Formulaire d'adhésion
   Validation, UX et envoi vers Google Sheets (Apps Script)
   ========================================================= */
(() => {
  'use strict';

  /* ---------- CONFIGURATION ----------
     L'envoi se fait par défaut vers notre base de données locale (/api/adhesions).
     Si une URL Google Apps Script externe est fournie, elle sera utilisée. */
  const CONFIG = {
    ENDPOINT: '/api/adhesions',
    MIN_SUBMIT_DELAY_MS: 1500, // anti-bot : temps minimum avant l'envoi
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const form = $('#joinForm');
  const submitBtn = $('#submitBtn');
  const statusEl = $('#formStatus');
  const successEl = $('#success');
  const loadedAt = Date.now();

  // Permet de réinitialiser le formulaire si besoin avec ?reset=1 ou ?nouveau=1
  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('reset') === '1' || urlParams.get('nouveau') === '1') {
      localStorage.removeItem('arsii_submitted');
      localStorage.removeItem('arsii_submitted_email');
      localStorage.removeItem('arsii_submitted_msg');
      document.documentElement.classList.remove('is-submitted');
    }
  } catch (e) {}

  // Vérification : si la personne a soumis, on vérifie que son email est toujours dans la base
  // Si l'email a été supprimé, on réaffiche le formulaire
  const submittedEmail = localStorage.getItem('arsii_submitted_email');
  if (submittedEmail) {
    // On vérifie côté serveur si cet email existe encore dans la base
    fetch('/api/check-email?email=' + encodeURIComponent(submittedEmail))
      .then(r => r.json())
      .then(data => {
        if (data.exists) {
          // Toujours inscrit → on affiche l'écran de succès
          form.hidden = true;
          const savedMsg = localStorage.getItem('arsii_submitted_msg');
          if (savedMsg) { const sub = $('p', successEl); if (sub) sub.textContent = savedMsg; }
          successEl.hidden = false;
          document.documentElement.classList.add('is-submitted');
        } else {
          // Plus dans la base → on efface et on réaffiche le formulaire
          localStorage.removeItem('arsii_submitted');
          localStorage.removeItem('arsii_submitted_email');
          localStorage.removeItem('arsii_submitted_msg');
          document.documentElement.classList.remove('is-submitted');
          form.hidden = false;
          successEl.hidden = true;
        }
      })
      .catch(() => {
        // En cas d'erreur réseau, on affiche quand même l'écran de succès (fallback)
        form.hidden = true;
        successEl.hidden = false;
        document.documentElement.classList.add('is-submitted');
      });
  }

  /* ---------- GESTION DU THÈME SOMBRE / CLAIR ---------- */
  const themeToggle = $('#themeToggle');
  const toggleText = $('.theme-toggle__text', themeToggle);

  function updateThemeUI(isDark) {
    if (toggleText) {
      toggleText.textContent = isDark ? 'Mode clair' : 'Mode sombre';
    }
    if (themeToggle) {
      themeToggle.setAttribute('aria-label', isDark ? 'Passer en mode clair' : 'Passer en mode sombre');
      themeToggle.setAttribute('title', isDark ? 'Passer en mode clair' : 'Passer en mode sombre');
    }
  }

  function initTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    updateThemeUI(isDark);

    if (themeToggle) {
      themeToggle.addEventListener('click', () => {
        const currentDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const nextDark = !currentDark;
        if (nextDark) {
          document.documentElement.setAttribute('data-theme', 'dark');
          localStorage.setItem('theme', 'dark');
        } else {
          document.documentElement.removeAttribute('data-theme');
          localStorage.setItem('theme', 'light');
        }
        updateThemeUI(nextDark);
      });
    }

    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (!localStorage.getItem('theme')) {
          if (e.matches) {
            document.documentElement.setAttribute('data-theme', 'dark');
          } else {
            document.documentElement.removeAttribute('data-theme');
          }
          updateThemeUI(e.matches);
        }
      });
    } catch (e) {}
  }

  initTheme();

  /* ---------- Règles de validation ---------- */
  const validators = {
    nom:        v => v.trim().length >= 2 || 'Entrez votre nom (2 caractères minimum).',
    prenom:     v => v.trim().length >= 2 || 'Entrez votre prénom (2 caractères minimum).',
    email:      v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'Entrez une adresse email valide (ex : nom@domaine.com).',
    telephone:  v => {
      const d = v.replace(/[\s.\-()]/g, '').replace(/^(\+|00)216/, '');
      return /^\d{8}$/.test(d) || 'Entrez un numéro tunisien valide (8 chiffres, ex : +216 20 123 456).';
    },
    niveau:     v => !!v || 'Sélectionnez votre niveau d’études.',
    filiere:    v => v.trim().length >= 2 || 'Indiquez votre filière ou spécialité.',
    annee:      v => !!v || 'Sélectionnez votre année d’études.',
    motivation: v => v.trim().length >= 10 || 'Dites-nous en un peu plus (10 caractères minimum).',
  };

  function setError(input, message) {
    const field = input.closest('.field');
    const err = $('.error', field);
    field.classList.toggle('invalid', !!message);
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (err) err.textContent = message || '';
  }

  function validateField(input) {
    const rule = validators[input.name];
    if (!rule) return true;
    const result = rule(input.value);
    setError(input, result === true ? '' : result);
    return result === true;
  }

  /* Validation à la sortie du champ, puis en direct une fois l'erreur affichée */
  Object.keys(validators).forEach(name => {
    const input = form.elements[name];
    input.addEventListener('blur', () => validateField(input));
    const live = () => { if (input.closest('.field').classList.contains('invalid')) validateField(input); };
    input.addEventListener('input', live);
    input.addEventListener('change', live);
  });

  /* ---------- Compteur de caractères ---------- */
  const textarea = form.elements.motivation;
  const counter = $('#counter');
  const updateCounter = () => {
    const n = textarea.value.length;
    counter.textContent = `${n}/500`;
    counter.classList.toggle('near', n >= 450);
  };
  textarea.addEventListener('input', updateCounter);

  /* ---------- Champs "Autre" ---------- */
  function bindOther(toggleSelector, textSelector, groupName) {
    const text = $(textSelector);
    const sync = () => {
      const on = $(toggleSelector).checked;
      text.disabled = !on;
      if (on) text.focus({ preventScroll: true }); else text.value = '';
    };
    $$(`input[name="${groupName}"]`).forEach(i => i.addEventListener('change', sync));
    text.disabled = true;
  }
  bindOther('#interetAutre', '#interetAutreTxt', 'interets');
  bindOther('#sourceAutre', '#sourceAutreTxt', 'source');

  /* ---------- Collecte des données ---------- */
  function collectData() {
    const fd = new FormData(form);
    const interets = fd.getAll('interets').map(v =>
      v === 'Autre' && fd.get('interetAutreTxt').trim() ? `Autre : ${fd.get('interetAutreTxt').trim()}` : v
    );
    let source = fd.get('source') || '';
    if (source === 'Autre' && fd.get('sourceAutreTxt').trim()) source = `Autre : ${fd.get('sourceAutreTxt').trim()}`;

    return {
      nom: fd.get('nom').trim(),
      prenom: fd.get('prenom').trim(),
      email: fd.get('email').trim().toLowerCase(),
      telephone: fd.get('telephone').trim(),
      niveau: fd.get('niveau'),
      filiere: fd.get('filiere').trim(),
      annee: fd.get('annee'),
      motivation: fd.get('motivation').trim(),
      interets: interets.join(', '),
      source,
      website: fd.get('website'), // honeypot
    };
  }

  /* ---------- Envoi ---------- */
  function setStatus(msg, isError = false) {
    statusEl.textContent = msg;
    statusEl.classList.toggle('is-error', isError);
  }

  function setLoading(on) {
    submitBtn.disabled = on;
    submitBtn.classList.toggle('loading', on);
    $('.btn__label', submitBtn).textContent = on ? 'Envoi en cours…' : 'Envoyer ma candidature';
  }

  async function send(data) {
    const endpoint = CONFIG.ENDPOINT || '/api/adhesions';
    const isLocalApi = endpoint.startsWith('/') || endpoint.includes('localhost') || endpoint.includes('127.0.0.1');

    if (isLocalApi) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json;charset=utf-8' },
        body: JSON.stringify(data),
      });

      const resData = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = (resData.errors && resData.errors.join(' ')) || resData.message || 'Erreur lors de l’enregistrement.';
        throw new Error(errorMsg);
      }

      return resData;
    }

    // Google Apps Script ou service externe
    await fetch(endpoint, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(data),
    });

    return { success: true };
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    setStatus('');

    const inputs = Object.keys(validators).map(n => form.elements[n]);
    const results = inputs.map(validateField);
    const firstInvalid = inputs[results.indexOf(false)];
    if (firstInvalid) {
      firstInvalid.focus();
      setStatus('Veuillez corriger les champs en rouge.', true);
      return;
    }

    const data = collectData();

    // Anti-spam : champ piège rempli ou envoi trop rapide → on fait semblant de réussir
    if (data.website || Date.now() - loadedAt < CONFIG.MIN_SUBMIT_DELAY_MS) {
      return showSuccess();
    }

    setLoading(true);
    try {
      const res = await send(data);
      if (res && res.duplicate) {
        // BLOC STRICT : afficher une erreur claire, ne pas montrer la page de succès
        setStatus('⛔ Cette adresse email est déjà enregistrée dans notre base de données. Vous ne pouvez adhérer qu\'une seule fois.', true);
        // Scroll vers le champ email et le surligner en rouge
        const emailField = document.querySelector('#email');
        if (emailField) {
          emailField.closest('.field')?.classList.add('invalid');
          emailField.scrollIntoView({ behavior: 'smooth', block: 'center' });
          emailField.focus();
        }
      } else {
        showSuccess(null);
      }
    } catch (err) {
      console.error(err);
      setStatus(err.message || 'Une erreur est survenue. Vérifiez votre connexion et réessayez.', true);
    } finally {
      setLoading(false);
    }
  });

  function showSuccess(customSubtitle) {
    form.hidden = true;
    if (customSubtitle) {
      const sub = $('p', successEl);
      if (sub) sub.textContent = customSubtitle;
    }
    successEl.hidden = false;
    document.documentElement.classList.add('is-submitted');
    successEl.focus();
    successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Mémorisation dans le navigateur : on stocke l'email pour pouvoir vérifier côté base
    try {
      const emailInput = form.elements['email'];
      if (emailInput && emailInput.value) {
        localStorage.setItem('arsii_submitted_email', emailInput.value.trim().toLowerCase());
      }
      localStorage.setItem('arsii_submitted', 'true');
      if (customSubtitle) {
        localStorage.setItem('arsii_submitted_msg', customSubtitle);
      }
    } catch (e) {}
  }
})();
