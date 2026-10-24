/**
 * 열 선택 — 표시/숨김 · 순서 바꾸기 · 좌측 고정.
 *
 * admission-outcomes 의 src/ui/panels.js 에서 openColumns 만 그대로 옮겼다(불러온 파일 목록은 없다).
 */

import { el, clear, openDialog, dialogFrame } from '../dom.js';
import { GROUP_LABEL, GROUP_ORDER } from './registry.js';

/**
 * 열 선택 — 표시/숨김 · 순서 바꾸기 · 좌측 고정.
 *
 * 열이 많으면 전부 켜 놓고 볼 수 없다. 보일 열과 순서를 고르는 화면이다.
 *
 * @param {HTMLDialogElement} dialog
 * @param {object} options
 * @param {object[]} options.registry
 * @param {string[]} options.columns 지금 보이는 열 (순서대로)
 * @param {number} options.pinned 좌측에 고정한 열 수
 * @param {(next: {columns: string[], pinned: number}) => void} options.onApply
 */
export function openColumns(dialog, { registry, columns, pinned, onApply }) {
  let chosen = [...columns];
  let pinCount = pinned;
  const byKey = new Map(registry.map((field) => [field.key, field]));

  // 두 목록이 각자 스크롤한다. 대화상자까지 함께 스크롤되면 스크롤바가 둘로 겹쳐
  // 어느 쪽이 움직이는지 알 수 없다
  const shownList = el('ol', { class: 'mt-2 max-h-[22rem] scroll-stable space-y-1 overflow-y-auto' });
  const pickList = el('div', { class: 'mt-2 max-h-[22rem] scroll-stable space-y-4 overflow-y-auto' });
  const pinNote = el('p', { class: 'mt-1 text-base text-ink-soft' });

  function move(key, delta) {
    const index = chosen.indexOf(key);
    const target = index + delta;
    if (target < 0 || target >= chosen.length) return;
    [chosen[index], chosen[target]] = [chosen[target], chosen[index]];
    paint();
  }

  /** 드래그로 순서 바꾸기. 버튼으로도 되게 두 길을 모두 연다. */
  function dropOn(fromKey, toKey) {
    if (fromKey === toKey) return;
    const rest = chosen.filter((key) => key !== fromKey);
    const at = rest.indexOf(toKey);
    chosen = [...rest.slice(0, at), fromKey, ...rest.slice(at)];
    paint();
  }

  function paintShown() {
    clear(shownList).append(...chosen.map((key, index) => {
      const field = byKey.get(key);
      const isPinned = index < pinCount;
      return el('li', {
        class: `flex min-h-11 items-center gap-2 rounded-xl border px-3 ${isPinned ? 'border-brand/40 bg-brand-soft' : 'border-line bg-surface'}`,
        attrs: { draggable: 'true' },
        on: {
          dragstart: (event) => event.dataTransfer.setData('text/plain', key),
          dragover: (event) => event.preventDefault(),
          drop: (event) => { event.preventDefault(); dropOn(event.dataTransfer.getData('text/plain'), key); }
        }
      }, [
        el('span', { class: 'cursor-grab text-ink-soft', attrs: { 'aria-hidden': 'true' }, text: '⠿' }),
        el('span', { class: 'min-w-0 flex-1 truncate text-base', text: field?.label ?? key, attrs: { title: field?.label ?? key } }),
        isPinned ? el('span', { class: 'shrink-0 text-base font-semibold text-brand', text: '고정' }) : null,
        el('button', {
          class: 'btn btn-sm border-transparent px-2', text: '↑',
          attrs: { type: 'button', 'aria-label': `${field?.label ?? key} 위로` },
          on: { click: () => move(key, -1) }
        }),
        el('button', {
          class: 'btn btn-sm border-transparent px-2', text: '↓',
          attrs: { type: 'button', 'aria-label': `${field?.label ?? key} 아래로` },
          on: { click: () => move(key, 1) }
        }),
        el('button', {
          class: 'btn btn-sm border-transparent px-2 text-ink-soft', text: '✕',
          attrs: { type: 'button', 'aria-label': `${field?.label ?? key} 숨기기` },
          on: { click: () => { chosen = chosen.filter((item) => item !== key); paint(); } }
        })
      ]);
    }));
  }

  function paintPicker() {
    const shown = new Set(chosen);
    clear(pickList);
    for (const group of GROUP_ORDER) {
      const inGroup = registry.filter((field) => field.group === group);
      if (inGroup.length === 0) continue;
      pickList.append(el('section', {}, [
        el('h4', { class: 'text-base font-bold text-ink-soft', text: GROUP_LABEL[group] ?? group }),
        el('div', { class: 'mt-1 flex flex-wrap gap-2' }, inGroup.map((field) => el('button', {
          class: `btn btn-sm ${shown.has(field.key) ? 'btn-primary' : ''} ${field.filled === 0 ? 'opacity-50' : ''}`,
          attrs: {
            type: 'button',
            title: field.filled === 0 ? '값이 하나도 없는 열입니다' : `${field.filled}건에 값이 있습니다`,
            'aria-pressed': shown.has(field.key)
          },
          on: {
            click: () => {
              chosen = shown.has(field.key)
                ? chosen.filter((key) => key !== field.key)
                : [...chosen, field.key];
              paint();
            }
          }
        }, [field.label])))
      ]));
    }
  }

  const pinInput = el('input', {
    class: 'field mt-1 w-24 text-center figure',
    attrs: { type: 'number', min: 0, max: 6, step: 1, value: pinCount, 'aria-label': '고정할 열 수' },
    on: { change: (event) => { pinCount = Math.max(0, Math.min(6, Number(event.target.value) || 0)); paint(); } }
  });

  function paint() {
    pinCount = Math.min(pinCount, chosen.length);
    // 열을 지워 고정 수가 깎이면 칸의 숫자도 따라가야 한다. 아래 글귀와 어긋나 보였다
    pinInput.value = String(pinCount);
    paintShown();
    paintPicker();
    pinNote.textContent = pinCount === 0
      ? '고정한 열이 없습니다. 가로로 스크롤하면 왼쪽 열도 함께 밀려납니다.'
      : `앞 ${pinCount}개 열이 왼쪽에 붙어 있습니다.`;
  }

  // 좁은 화면에서 좌우로 나누면 「자료에 있는 열」이 접혀 내려가 안 보인다.
  // 그 목록이 이 화면에 오는 이유 자체라, 768px부터 나누어 둘 다 한눈에 둔다
  const body = el('div', { class: 'grid gap-5 md:grid-cols-2' }, [
    el('section', {}, [
      el('h3', { class: 'text-lg font-bold tracking-tight', text: '보이는 열' }),
      el('p', { class: 'text-base text-ink-soft', text: '끌어다 놓거나 화살표로 순서를 바꿉니다. 표의 열 이름을 끌어도 됩니다.' }),
      shownList,
      el('div', { class: 'mt-4' }, [
        el('label', { class: 'text-base font-semibold', text: '왼쪽에 고정할 열 수' }),
        pinInput,
        pinNote
      ])
    ]),
    el('section', {}, [
      el('h3', { class: 'text-lg font-bold tracking-tight', text: '데이터에 있는 열' }),
      el('p', { class: 'text-base text-ink-soft', text: '누르면 켜지고 꺼집니다.' }),
      pickList
    ])
  ]);

  paint();

  openDialog(dialog, dialogFrame({
    title: '열 선택',
    body,
    onClose: () => dialog.close(),
    footer: el('div', { class: 'flex w-full items-center justify-end gap-3' }, [
      el('button', { class: 'btn', text: '취소', attrs: { type: 'button' }, on: { click: () => dialog.close() } }),
      el('button', {
        class: 'btn btn-primary', text: '적용', attrs: { type: 'button' },
        // 열이 하나도 없으면 표가 빈다. 그런 적용은 받지 않는다
        on: { click: () => { if (chosen.length === 0) return; onApply({ columns: chosen, pinned: pinCount }); dialog.close(); } }
      })
    ])
  }));
}
