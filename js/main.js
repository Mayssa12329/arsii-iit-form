/* =========================================================
   Club ARSII IIT – Formulaire d'adhésion
   Validation, UX et envoi vers Google Sheets (Apps Script)
   ========================================================= */
(() => {
  'use strict';

  /* ---------- CONFIGURATION ----------
     L'envoi se fait par défaut vers notre base de données locale (/api/adhesions).
     Si le site est ouvert depuis un autre port local (ex: Live Server 5500) ou en local, on cible le port 3000 */
  const port = window.location.port;
  const isPort3000 = port === '3000';
  const isFile = window.location.protocol === 'file:';
  const apiBase = (isFile || (!isPort3000 && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || /^192\.168\./.test(window.location.hostname))))
    ? 'http://localhost:3000'
    : '';

  const CONFIG = {
    ENDPOINT: apiBase ? `${apiBase}/api/adhesions` : '/api/adhesions',
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
    if (urlParams.get('reset') === '1' || urlParams.get('nouveau') === '1' || urlParams.get('test') === '1') {
      localStorage.removeItem('arsii_submitted');
      localStorage.removeItem('arsii_submitted_email');
      localStorage.removeItem('arsii_submitted_msg');
      document.documentElement.classList.remove('is-submitted');
    }
  } catch (e) {}

  // Vérification de l'état d'adhésion précédent
  const submittedEmail = localStorage.getItem('arsii_submitted_email');
  if (submittedEmail) {
    const checkUrl = `${apiBase}/api/check-email?email=${encodeURIComponent(submittedEmail)}`;
    fetch(checkUrl)
      .then(r => r.json())
      .then(data => {
        if (data && data.exists) {
          form.hidden = true;
          const savedMsg = localStorage.getItem('arsii_submitted_msg');
          if (savedMsg) { const sub = $('p', successEl); if (sub) sub.textContent = savedMsg; }
          successEl.hidden = false;
          document.documentElement.classList.add('is-submitted');
        } else {
          localStorage.removeItem('arsii_submitted');
          localStorage.removeItem('arsii_submitted_email');
          localStorage.removeItem('arsii_submitted_msg');
          document.documentElement.classList.remove('is-submitted');
          form.hidden = false;
          successEl.hidden = true;
        }
      })
      .catch(() => {
        // En cas d'erreur de communication, on garde le formulaire accessible pour soumettre
        form.hidden = false;
        successEl.hidden = true;
        document.documentElement.classList.remove('is-submitted');
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
        const err = new Error(errorMsg);
        if (resData.duplicatePhone) err.duplicatePhone = true;
        if (resData.duplicateEmail) err.duplicateEmail = true;
        throw err;
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

    // Anti-spam strict : champ piège caché honeypot uniquement
    if (data.website) {
      return showSuccess();
    }

    setLoading(true);
    try {
      const res = await send(data);
      const msg = (res && res.emailSent)
        ? `Un email de confirmation officiel avec tous les détails du Club vient d'être envoyé à ${data.email}. (Pensez à vérifier vos spams ou courriers indésirables).`
        : `Merci pour votre inscription ! Votre adhésion a bien été enregistrée.`;
      showSuccess(msg);
    } catch (err) {
      console.error(err);
      setStatus(err.message || 'Une erreur est survenue. Vérifiez votre connexion et réessayez.', true);

      if (err.duplicatePhone) {
        const telField = document.querySelector('#telephone');
        if (telField) {
          const wrapper = telField.closest('.field');
          wrapper?.classList.add('invalid');
          const errEl = wrapper?.querySelector('.error');
          if (errEl) errEl.textContent = 'Ce numéro est déjà inscrit.';
          telField.scrollIntoView({ behavior: 'smooth', block: 'center' });
          telField.focus();
        }
      }

      if (err.duplicateEmail) {
        const emailField = document.querySelector('#email');
        if (emailField) {
          const wrapper = emailField.closest('.field');
          wrapper?.classList.add('invalid');
          const errEl = wrapper?.querySelector('.error');
          if (errEl) errEl.textContent = 'Cet email est déjà inscrit.';
          emailField.scrollIntoView({ behavior: 'smooth', block: 'center' });
          emailField.focus();
        }
      }
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

  /* Fonction pour réinitialiser le formulaire avec des champs 100% vides */
  window.resetFormForNewMember = function () {
    try {
      localStorage.removeItem('arsii_submitted');
      localStorage.removeItem('arsii_submitted_email');
      localStorage.removeItem('arsii_submitted_msg');
    } catch (e) {}

    document.documentElement.classList.remove('is-submitted');
    document.body.classList.remove('is-submitted');

    if (form) {
      form.reset();

      // Vider manuellement tous les champs texte, email, tel, textarea
      const inputs = form.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], textarea');
      inputs.forEach(input => {
        input.value = '';
        input.removeAttribute('aria-invalid');
      });

      // Réinitialiser les menus déroulants
      const selects = form.querySelectorAll('select');
      selects.forEach(select => {
        select.selectedIndex = 0;
        select.removeAttribute('aria-invalid');
      });

      // Décocher toutes les cases à cocher et boutons radio
      const checks = form.querySelectorAll('input[type="checkbox"], input[type="radio"]');
      checks.forEach(check => {
        check.checked = false;
      });

      // Désactiver les champs "Autre"
      const otherInputs = form.querySelectorAll('.other');
      otherInputs.forEach(oi => {
        oi.disabled = true;
        oi.value = '';
      });

      // Nettoyer les messages d'erreur et classes invalid
      const fields = form.querySelectorAll('.field');
      fields.forEach(f => f.classList.remove('invalid'));

      const errors = form.querySelectorAll('.error');
      errors.forEach(err => {
        err.textContent = '';
      });

      const counter = document.getElementById('counter');
      if (counter) counter.textContent = '0/500';

      form.hidden = false;
      form.style.display = 'block';
    }

    if (successEl) {
      successEl.hidden = true;
      successEl.style.display = 'none';
    }

    // Scroll fluide vers le haut du formulaire et focus sur le premier champ
    const header = document.querySelector('.intro') || form;
    if (header) {
      header.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    setTimeout(() => {
      const firstInput = form ? form.querySelector('#nom') : null;
      if (firstInput) firstInput.focus();
    }, 400);
  };
})();
