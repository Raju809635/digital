function readGroup(text, start) {
  if (text[start] !== '{') return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}' && --depth === 0) return { value: text.slice(start + 1, i), end: i + 1 };
  }
  return null;
}

function plainLatex(value) {
  let text = String(value || '').replace(/\\n(?=\s*(?:\d+[.)]|[-*]))/g, '\n');
  text = text.replace(/\\\[|\\\]|\\\(|\\\)|\\begin\{(?:aligned|array|equation\*?)\}|\\end\{(?:aligned|array|equation\*?)\}/g, '');
  for (let count = 0; count < 20; count++) {
    const match = /\\(?:dfrac|tfrac|frac)\s*/.exec(text);
    if (!match) break;
    const numerator = readGroup(text, match.index + match[0].length);
    if (!numerator) break;
    const whitespace = /^\s*/.exec(text.slice(numerator.end))[0].length;
    const denominator = readGroup(text, numerator.end + whitespace);
    if (!denominator) break;
    const replacement = '(' + plainLatex(numerator.value) + ') / (' + plainLatex(denominator.value) + ')';
    text = text.slice(0, match.index) + replacement + text.slice(denominator.end);
  }
  return text
    .replace(/\\(?:left|right)(?![A-Za-z])/g, '')
    .replace(/\\(?:,|;|:|!|quad|qquad)(?![A-Za-z])/g, ' ')
    .replace(/\\(?:cdot|times)(?![A-Za-z])/g, '*').replace(/\\div(?![A-Za-z])/g, '/')
    .replace(/\\(?:leq|le)(?![A-Za-z])/g, '<=').replace(/\\(?:geq|ge)(?![A-Za-z])/g, '>=').replace(/\\neq(?![A-Za-z])/g, '!=')
    .replace(/\\(?:int|oint)(?![A-Za-z])/g, 'integral').replace(/\\sum(?![A-Za-z])/g, 'SUM')
    .replace(/\\ln(?![A-Za-z])/g, 'ln').replace(/\\log(?![A-Za-z])/g, 'log').replace(/\\sqrt\s*/g, 'sqrt ')
    .replace(/\\(?:sin|cos|tan|exp)(?![A-Za-z])/g, function (command) { return command.slice(1); })
    .replace(/\\(?:alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|phi|omega)(?![A-Za-z])/gi, function (command) { return command.slice(1); })
    .replace(/\\(?:text|mathrm|mathbf|operatorname)\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\boxed\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\[{}]/g, function (match) { return match[1]; })
    .replace(/\^\{([^{}]+)\}/g, '^($1)').replace(/_\{([^{}]+)\}/g, '_$1')
    .replace(/[{}]/g, '')
    .replace(/\\/g, '');
}

export function readableText(value = '') {
  let text = plainLatex(value).normalize('NFD')
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/[\u200B-\u200F\u2060\uFEFF]/g, '')
    .replace(/([A-Za-z])\u0304/g, '$1_mean');
  const replacements = new Map([
    [0x03B2, 'beta'], [0x0392, 'beta'], [0x03B5, 'epsilon'], [0x0395, 'epsilon'],
    [0x03A3, 'SUM'], [0x2211, 'SUM'], [0x03BC, 'mu'], [0x039C, 'mu'],
    [0x03B8, 'theta'], [0x0398, 'theta'], [0x03BB, 'lambda'], [0x039B, 'lambda'],
    [0x03B1, 'alpha'], [0x0391, 'alpha'], [0x0394, 'delta'], [0x03B4, 'delta'],
    [0x03C0, 'pi'], [0x03A0, 'pi'], [0x03C3, 'sigma'], [0x03C6, 'phi'], [0x03A6, 'phi'],
    [0x03C9, 'omega'], [0x03A9, 'omega'], [0x222B, 'integral'], [0x2202, 'partial'],
    [0x221A, 'sqrt '], [0x00D7, '*'], [0x00B7, '*'], [0x00F7, '/'],
    [0x2010, '-'], [0x2011, '-'], [0x2012, '-'], [0x2013, '-'], [0x2014, '-'],
    [0x2015, '-'], [0x2043, '-'], [0x2212, '-'], [0x00AD, '-'],
    [0x2018, "'"], [0x2019, "'"], [0x201A, "'"], [0x201C, '"'], [0x201D, '"'],
    [0x2022, '-'], [0x2023, '-'], [0x2043, '-'], [0x2264, '<='], [0x2265, '>='],
    [0x2260, '!='], [0x2248, 'approximately'], [0x2192, ' to '], [0x21D2, ' to '],
    [0x2190, ' from '], [0x221E, 'infinity'], [0x2208, 'in'], [0x25A1, '[symbol]']
  ]);
  for (const [codePoint, replacement] of replacements) text = text.split(String.fromCodePoint(codePoint)).join(replacement);
  for (let i = 0; i < 10; i++) {
    text = text.split(String.fromCodePoint(0x2080 + i)).join('_' + i);
    const superCode = i === 0 ? 0x2070 : i < 4 ? 0x00B0 + i : 0x2070 + i;
    text = text.split(String.fromCodePoint(superCode)).join('^' + i);
  }
  text = text.split(String.fromCodePoint(0x1D62)).join('_i').split(String.fromCodePoint(0x2C7C)).join('_j').split(String.fromCodePoint(0x2099)).join('_n');
  return text.replace(/[ \t]{2,}/g, ' ').trim().normalize('NFC');
}

export function isMathQuestion(question = '', subject = '', explanation = '') {
  const text = question + ' ' + explanation;
  const mathSymbols = [0x222B, 0x2211, 0x221A, 0x2202].some(codePoint => text.includes(String.fromCodePoint(codePoint)));
  return /\\(?:int|oint|frac|dfrac|tfrac|sum|sqrt|ln|log|sin|cos|tan|lim|partial)(?![A-Za-z])|\b(?:differentiate|integrate|derivative|antiderivative|solve for|indefinite integral)\b|\d\s*(?:[=+*/^]|-)\s*\d/i.test(text) || mathSymbols
    || /\b(?:mathematics|maths|calculus|linear algebra|probability|statistics|engineering mathematics)\b/i.test(subject);
}
