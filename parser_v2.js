// PARSER V2 - ULTRA INTELLIGENT
function parseTrainingPlan(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  let sessions = [];
  let currentSession = null;
  let totalKm = 0;

  lines.forEach(line => {
    const lower = line.toLowerCase();

    // Détection nouvelle séance
    if (lower.match(/séance\s+\d+/i) ||
        lower.match(/^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s*:/i)) {

      // Sauvegarder séance précédente
      if (currentSession && currentSession.km > 0) {
        sessions.push(currentSession);
        totalKm += currentSession.km;
      }

      currentSession = { name: line, km: 0, lines: [] };
      return;
    }

    // Skip lignes de renforcement
    if (lower.includes('gainage') || lower.includes('squat') || lower.includes('fente') ||
        lower.includes('hip thrust') || lower.includes('mollet') || lower.includes('proprioception') ||
        lower.match(/^\s*\*/)) {
      return;
    }

    if (!currentSession) {
      currentSession = { name: 'Session', km: 0, lines: [] };
    }

    let lineKm = 0;

    // 1. KM directs
    const kmMatch = line.match(/(\d+(?:\.\d+)?)\s*km/gi);
    if (kmMatch) {
      kmMatch.forEach(m => {
        lineKm += parseFloat(m.replace(/km/i, ''));
      });
    }

    // 2. Fractionnés mètres: 5 × 1 000 m, 10×400m, 6 × 800 m
    const fracM = line.match(/(\d+)\s*[×x]\s*(\d+(?:\s+\d+)?)\s*m(?!in)/gi);
    if (fracM) {
      fracM.forEach(m => {
        const parts = m.match(/(\d+)\s*[×x]\s*(\d+(?:\s+\d+)?)/i);
        if (parts) {
          const reps = parseInt(parts[1]);
          const dist = parseInt(parts[2].replace(/\s+/g, ''));
          lineKm += (reps * dist) / 1000;
        }
      });
    }

    // 3. Séries avec temps: 2 × 8 × 200 m
    const fracMulti = line.match(/(\d+)\s*[×x]\s*(\d+)\s*[×x]\s*(\d+)\s*m/gi);
    if (fracMulti) {
      fracMulti.forEach(m => {
        const parts = m.match(/(\d+)\s*[×x]\s*(\d+)\s*[×x]\s*(\d+)/i);
        if (parts) {
          const series = parseInt(parts[1]);
          const reps = parseInt(parts[2]);
          const dist = parseInt(parts[3]);
          lineKm += (series * reps * dist) / 1000;
        }
      });
    }

    // 4. Temps avec allure: 20', 1h15, 50min, 1h20 à 1h25
    let minutes = 0;

    // Format: 1h20 à 1h25 ou 1h20
    const timeHM = line.match(/(\d+)h(\d+)/gi);
    if (timeHM) {
      timeHM.forEach(t => {
        const p = t.match(/(\d+)h(\d+)/i);
        if (p) minutes += parseInt(p[1]) * 60 + parseInt(p[2]);
      });
      if (timeHM.length > 1) minutes = minutes / 2; // Moyenne
    }

    // Format: 20', 50'
    const timeMin = line.match(/(\d+)'/g);
    if (timeMin && !timeHM) {
      timeMin.forEach(t => {
        minutes += parseInt(t.replace("'", ''));
      });
    }

    // Format: 50min, 65 min
    const timeWord = line.match(/(\d+)\s*min(?!\/)/gi);
    if (timeWord && !timeMin && !timeHM) {
      timeWord.forEach(t => {
        minutes += parseInt(t.replace(/min/i, ''));
      });
    }

    // 5. Secondes (30''/30'', 30 s, 42 à 44 s)
    const timeSec = line.match(/(\d+)''/g);
    if (timeSec) {
      timeSec.forEach(t => {
        minutes += parseInt(t.replace("''", '')) / 60;
      });
    }

    if (minutes > 0 && !kmMatch) {
      // Détecter allure
      let pace = 5.33; // défaut EF

      // Allure explicite: 4'02/km, 5'10 à 5'35/km
      const paceExplicit = line.match(/(\d+)'(\d+)/);
      if (paceExplicit) {
        pace = parseInt(paceExplicit[1]) + parseInt(paceExplicit[2]) / 60;
      }
      // Allure en secondes: 3'45 à 3'50/km
      else if (lower.includes('vma') || lower.includes('3'45') || lower.includes('3'50')) {
        pace = 3.75;
      }
      else if (lower.includes('seuil') || lower.match(/4'0\d/)) {
        pace = 4.08;
      }
      else if (lower.includes('ef') || lower.includes('endurance fondamentale') ||
               lower.includes('échauffement') || lower.includes('footing')) {
        pace = 5.33;
      }
      else if (lower.includes('calme') || lower.includes('récup') || lower.includes('recup')) {
        pace = 6.0;
      }
      else if (lower.includes('facile') || lower.includes('tranquille')) {
        pace = 5.83;
      }
      else if (lower.includes('rapide') || lower.includes('vite')) {
        pace = 4.0;
      }

      lineKm += minutes / pace;
    }

    // 6. Séries avec temps et allure: 3 × 12' à 4'02, 2 × 15' à 4'00/km
    const seriesTime = line.match(/(\d+)\s*[×x]\s*(\d+)'\s*à/gi);
    if (seriesTime) {
      seriesTime.forEach(m => {
        const p = m.match(/(\d+)\s*[×x]\s*(\d+)'/i);
        if (p) {
          const reps = parseInt(p[1]);
          const mins = parseInt(p[2]);

          // Chercher allure
          const paceMatch = line.match(/(\d+)'(\d+)/);
          let pace = 4.08;
          if (paceMatch) {
            pace = parseInt(paceMatch[1]) + parseInt(paceMatch[2]) / 60;
          }

          lineKm += (reps * mins) / pace;
        }
      });
    }

    if (lineKm > 0) {
      currentSession.km += lineKm;
      currentSession.lines.push({ text: line, km: lineKm });
    }
  });

  // Sauvegarder dernière séance
  if (currentSession && currentSession.km > 0) {
    sessions.push(currentSession);
    totalKm += currentSession.km;
  }

  return {
    totalKm: parseFloat(totalKm.toFixed(1)),
    sessions: sessions,
    nbSessions: sessions.length,
    restDays: Math.max(0, 7 - sessions.length)
  };
}

// Export pour test
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseTrainingPlan };
}
