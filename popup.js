const DEFAULTS = {
  enabled: true,
  sourceLang: 'es',
  targetLang: 'en',
  pauseOnHover: true,
  showLine: true,
};

const LANGUAGES = [
  ['en', 'English'],
  ['es', 'Spanish'],
  ['fi', 'Finnish'],
  ['sv', 'Swedish'],
  ['de', 'German'],
  ['fr', 'French'],
  ['it', 'Italian'],
  ['pt', 'Portuguese'],
  ['nl', 'Dutch'],
  ['ru', 'Russian'],
  ['ja', 'Japanese'],
  ['ko', 'Korean'],
  ['zh-CN', 'Chinese'],
];

function fillSelect(select, withAuto) {
  const options = withAuto ? [['auto', 'Auto-detect'], ...LANGUAGES] : LANGUAGES;
  for (const [code, name] of options) select.add(new Option(name, code));
}

fillSelect(document.getElementById('sourceLang'), true);
fillSelect(document.getElementById('targetLang'), false);

chrome.storage.sync.get(DEFAULTS, (settings) => {
  for (const [key, value] of Object.entries(settings)) {
    const input = document.getElementById(key);
    if (!input) continue;
    if (input.type === 'checkbox') input.checked = value;
    else input.value = value;
    input.addEventListener('change', () => {
      chrome.storage.sync.set({ [key]: input.type === 'checkbox' ? input.checked : input.value });
    });
  }
});
