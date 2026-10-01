import test from 'node:test';
import assert from 'node:assert/strict';
import { textLang } from '../src/shared/language';

test('app text is marked Arabic only when Arabic letters lead', () => {
  assert.equal(textLang('تقرير الأداء الربعي'), 'ar');
  assert.equal(textLang('Quarterly report'), undefined, 'English inherits the page language.');
  assert.equal(textLang(''), undefined);
  assert.equal(textLang('2026 (Q3)'), undefined, 'Digits and symbols are not letters.');
  assert.equal(textLang('١٢٣ ٤٥٦'), undefined, 'Arabic-Indic digits are not letters.');
  assert.equal(textLang('شرائح عربية PowerPoint'), 'ar', 'Mixed text follows its larger script.');
  assert.equal(textLang('Annual report تقرير'), undefined);
  assert.equal(textLang('Annual report of the company for the year: التقرير السنوي'), undefined, 'Mostly English bilingual text stays English.');
  assert.equal(textLang('التقرير السنوي للشركة عن العام المالي الماضي: Annual report'), 'ar', 'Mostly Arabic bilingual text is Arabic.');
});

test('a title takes its item’s derived language only when it has no letters', () => {
  assert.equal(textLang('2026', 'arabic'), 'ar');
  assert.equal(textLang('2026', 'bilingual'), undefined);
  assert.equal(textLang('2026', 'english'), undefined);
  assert.equal(textLang('Annual report', 'arabic'), undefined, 'An English title of an Arabic document stays English.');
  assert.equal(textLang('التقرير السنوي', 'english'), 'ar', 'An Arabic title of an English document is Arabic.');
});
