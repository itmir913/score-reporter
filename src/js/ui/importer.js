import {addExam, fileHashHex, normalizeExamKey, suggestExamKey} from '../exams/examStore.js';
import {expandUploads, loadWorkbook, needsPassword} from '../ingest/files.js';
import {countOutOfRange, matchFormats} from '../ingest/formatMatch.js';
import {exceljsTo2DArray} from '../main.js';
import {GradeDataParser} from '../parser.js';
import {FIELD_LABELS, SCHEMAS} from '../schema.js';
import {sameInquirySubject} from '../utils.js';
import {EncryptedLegacyXlsError, WrongPasswordError} from '../xlsx-decrypt.js';
import {clear, el} from './dom.js';

/* ───────────────────────────────────────────
   § 여러 파일 한꺼번에 불러오기
   올린 파일(여러 개·zip)을 「파일 추가」 화면의 표에 한 줄씩 늘어놓는다(대화상자를 띄우지 않는다).
   줄마다 암호·회차 이름·양식·시트를 확인하고, 「불러오기」 한 번으로 모두 회차로 넣는다.
   회차가 100개여도 단추는 한 번이다.
   - 암호 걸린 파일은 그 줄에 암호 칸을 띄운다. 같은 암호를 모든 파일에 한 번에 넣을 수도 있다.
   - 양식은 머리글 지문이 정확히 한 양식과 맞을 때만 미리 선택한다. 언제든 바꿀 수 있고,
     「미리보기」로 앞 5줄과 열 이름을 나란히 본다.
─────────────────────────────────────────── */

let nextId = 1;

/** 파일 하나를 표의 한 줄로. 암호 파일은 열지 않고 'locked' 로 둔다 */
export async function prepareFile({name, bytes, container}) {
    const row = {
        id: nextId++, name, container, bytes, hash: fileHashHex(bytes),
        include: true, status: 'loading', error: '', wb: null,
        sheet: '', formatId: null, autoId: null, candidates: [], key: suggestExamKey(name), preview: false,
    };
    if (needsPassword(row)) {
        row.status = 'locked';
        return row;
    }
    try {
        attach(row, await loadWorkbook(row));
    } catch (err) {
        fail(row, err);
    }
    return row;
}

/** 올린 것들(File·zip) → 줄 목록 + 건너뛴 것 */
export async function prepareUploads(files) {
    const uploads = [];
    for (const f of files) {
        // 브라우저 File 에도 bytes() 메서드가 있다. zip 에서 꺼낸 Uint8Array 인지 형태로 가린다
        const bytes = f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(await f.arrayBuffer());
        uploads.push({name: f.name, bytes});
    }
    const {files: sheets, skipped} = expandUploads(uploads);
    const rows = [];
    for (const f of sheets) rows.push(await prepareFile(f));
    return {rows, skipped};
}

function fail(row, err) {
    row.status = 'error';
    row.include = false;
    row.error = err instanceof EncryptedLegacyXlsError
        ? '암호가 걸린 옛 형식(.xls)은 열 수 없습니다. 엑셀에서 암호를 풀거나 .xlsx 로 저장해 주세요.'
        : '파일을 읽지 못했습니다. 손상되었거나 엑셀 파일이 아닙니다.';
}

/** 읽은 통합 문서를 줄에 붙인다. 머리글이 한 양식과 맞는 첫 시트를 선택한다 */
function attach(row, wb) {
    row.wb = wb;
    row.bytes = null; // 열었으면 원본 바이트는 더 쓰지 않는다. 파일이 100개여도 메모리를 아낀다
    row.status = 'ready';
    row.error = '';
    const found = wb.worksheets.map(ws => ({ws, m: matchFormats(ws, SCHEMAS)})).find(({m}) => m.autoId);
    selectSheet(row, (found?.ws ?? wb.worksheets[0])?.name ?? '');
}

/** 시트를 바꾸면 그 시트의 머리글로 양식을 다시 맞춘다. 맞는 양식이 없으면 선택한 양식을 비운다 */
export function selectSheet(row, sheetName) {
    row.sheet = sheetName;
    const ws = row.wb?.getWorksheet(sheetName);
    const m = ws ? matchFormats(ws, SCHEMAS) : {candidates: [], autoId: null};
    row.autoId = m.autoId;
    row.candidates = m.candidates;
    row.formatId = m.autoId;
}

/** 비밀번호로 연다. 틀리면 그 줄에 알린다 */
export async function unlock(row, password) {
    // 여는 중에 또 누르면 같은 줄을 두 번 해제해, 늦게 끝난 쪽이 사람이 선택한 시트·양식을 덮었다
    if (row.status !== 'locked' || !password || row.busy) return false;
    row.busy = true;
    try {
        attach(row, await loadWorkbook(row, {askPassword: async () => password}));
        return true;
    } catch (err) {
        if (err instanceof WrongPasswordError) {
            row.error = '비밀번호가 맞지 않습니다.';
            return false;
        }
        fail(row, err);
        return false;
    } finally {
        row.busy = false;
    }
}

/** 선택한 양식으로 읽었을 때 범위를 벗어나는 점수 개수. 불러오기 전에 표에서 알린다(§1-B 3번) */
export function rowOutOfRange(row) {
    if (row.status !== 'ready' || !row.formatId) return 0;
    const memo = `${row.sheet}|${row.formatId}`;
    if (row.rangeMemo !== memo) {
        row.rangeMemo = memo;
        row.rangeCount = countOutOfRange(new GradeDataParser(SCHEMAS[row.formatId]).parse(row.wb, row.sheet));
    }
    return row.rangeCount;
}

/** 불러오기를 막는 까닭들. 비면 불러올 수 있다 */
export function blockers(rows, existing = []) {
    const chosen = rows.filter(r => r.include);
    const problems = [];
    if (!chosen.length) problems.push('불러올 파일을 하나 이상 고르세요.');
    const keys = new Set();
    for (const r of chosen) {
        if (r.status === 'locked') problems.push(`${r.name}: 비밀번호를 넣어 주세요.`);
        else if (r.status !== 'ready') problems.push(`${r.name}: 읽을 수 없는 파일입니다. 체크를 해제하거나 목록에서 제거하세요.`);
        else if (!r.formatId) problems.push(`${r.name}: 진학 프로그램을 선택하세요.`);
        const key = normalizeExamKey(r.key);
        if (!key) problems.push(`${r.name}: 회차 이름을 넣어 주세요.`);
        else if (keys.has(key) || existing.some(e => normalizeExamKey(e.key) === key)) problems.push(`회차 이름 「${key}」이 겹칩니다.`);
        keys.add(key);
    }
    return problems;
}

/** 선택한 줄들을 회차로 넣는다. 돌려주는 것: 새 회차 목록과 회차마다의 주의 사항 */
export function commitRows(rows, exams) {
    let list = exams;
    const notes = [];
    for (const r of rows.filter(x => x.include)) {
        const students = new GradeDataParser(SCHEMAS[r.formatId]).parse(r.wb, r.sheet);
        const key = normalizeExamKey(r.key);
        list = addExam(list, {key, formatId: r.formatId, fileName: r.name, fileHash: r.hash, students});
        const warn = [];
        const sameInq = students.filter(sameInquirySubject).length;
        if (sameInq) warn.push(`탐구 과목 중복 ${sameInq}명(합산에는 탐구1 값만 씁니다)`);
        const out = countOutOfRange(students);
        if (out) warn.push(`범위를 벗어난 점수 ${out}개(양식을 확인하세요)`);
        notes.push({key, count: students.length, warn});
    }
    return {exams: list, notes};
}

/* ── 화면: 「파일 추가」 탭 안의 표 ── */

const tag = (kind, text) => el('span', {class: `tag tag-${kind} whitespace-nowrap`, text});

/** 앞 5줄 미리보기. 머리글 줄은 노랗게, 양식이 읽는 열은 이름을 위에 적는다 */
export function previewTable(ws, schema) {
    const rows = exceljsTo2DArray(ws).slice(0, (schema?.headerRows ?? 0) + 5);
    const width = Math.max(0, ...rows.map(r => r.length));
    const keyAt = {};
    for (const [key, idx] of Object.entries(schema?._idx ?? {})) if (idx !== null && idx !== undefined) keyAt[idx] = key;
    const cell = (v) => {
        const t = v === undefined || v === null ? '' : String(v);
        return el('td', {class: 'max-w-40 truncate border-b border-line-soft px-3 py-2', text: t, attrs: t ? {title: t} : {}});
    };
    return el('div', {class: 'overflow-x-auto rounded-lg border border-line bg-surface'}, [
        el('table', {class: 'w-full whitespace-nowrap text-base'}, [
            el('thead', {}, [el('tr', {}, Array.from({length: width}, (_, i) =>
                el('th', {
                    class: `border-b border-line px-3 py-2 text-left ${keyAt[i] ? 'font-semibold text-brand' : 'font-normal text-ink-soft/60'}`,
                    text: keyAt[i] ? FIELD_LABELS[keyAt[i]] : `${i + 1}열`,
                })))]),
            el('tbody', {}, rows.map((r, i) => el('tr', {class: i < (schema?.headerRows ?? 0) ? 'bg-wait-soft text-wait' : ''},
                Array.from({length: width}, (_, c) => cell(r[c]))))),
        ]),
        el('p', {
            class: 'px-3 py-2 text-base text-ink-soft', text: schema
                ? '노란 줄은 머리글입니다. 열 이름과 값이 맞지 않으면 양식을 바꾸세요.'
                : '양식을 선택하면 읽는 열의 이름이 표시됩니다.',
        }),
    ]);
}

/**
 * 불러오기 표를 그린다. 상태는 부르는 쪽이 들고 있고, 바뀔 때마다 다시 그린다.
 * @param {HTMLElement} root 표가 들어갈 자리
 * @param {{rows: object[], skipped: object[]}} state
 * @param {{existing: () => object[], onCommit: () => void, onChange?: () => void}} options
 */
export function renderImportTable(root, state, options) {
    const {existing, onCommit, onChange} = options;
    // 표를 다시 그려도 키보드 포커스를 잃지 않게, 같은 이름표의 칸으로 되돌린다
    const focused = root.contains(document.activeElement) ? document.activeElement?.getAttribute('aria-label') : null;
    clear(root);
    const {rows, skipped} = state;
    if (!rows.length && !skipped.length) return;
    const redraw = () => {
        renderImportTable(root, state, options);
        onChange?.();
    };
    const problems = blockers(rows, existing());
    const count = rows.filter(r => r.include).length;
    const locked = rows.filter(r => r.status === 'locked');

    if (locked.length > 1) {
        const all = el('input', {class: 'field', attrs: {type: 'password', placeholder: '같은 비밀번호를 쓰는 파일에 한 번에', autocomplete: 'off', 'aria-label': '모든 암호 파일 비밀번호'}});
        const go = async () => {
            if (state.unlocking) return;
            state.unlocking = true;
            button.disabled = true;
            button.textContent = '여는 중…';
            let failed = 0;
            for (const r of rows.filter(x => x.status === 'locked')) {
                const ok = await unlock(r, all.value);
                if (!ok && r.status === 'locked') {
                    r.error = '';
                    failed++;
                }
            }
            state.unlocking = false;
            state.bulkNote = failed ? `${failed}개 파일은 이 비밀번호로 열리지 않았습니다. 그 줄에서 따로 넣으세요.` : '';
            redraw();
        };
        const button = el('button', {class: 'btn', text: '모두 열기', attrs: {type: 'button'}, on: {click: go}});
        all.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
        root.append(el('div', {class: 'card mb-3 flex flex-wrap items-center gap-3 border-wait/40 bg-wait-soft px-4 py-3'}, [
            el('p', {class: 'text-base font-semibold text-wait', text: `암호가 걸린 파일 ${locked.length}개`}),
            el('div', {class: 'min-w-48 flex-1'}, [all]),
            button,
            el('p', {class: 'w-full text-base text-ink-soft', attrs: {'aria-live': 'polite'}, text: state.bulkNote || '비밀번호가 다른 파일은 그 줄에서 따로 넣으세요.'}),
        ]));
    }
    if (skipped.length) {
        root.append(el('p', {
            class: 'mb-3 rounded-lg bg-wait-soft px-4 py-2 text-base text-wait',
            text: `건너뛴 파일 ${skipped.length}개: ${skipped.map(s => `${s.name}(${s.reason})`).join(', ')}`,
        }));
    }

    const th = (text) => el('th', {class: 'border-b border-line px-3 py-2 text-left font-semibold text-ink-soft', text});
    const td = (children, cls = '', attrs = {}) => el('td', {class: `border-b border-line-soft px-3 py-2 align-middle ${cls}`, attrs}, children);
    const body = el('tbody');
    for (const row of rows) {
        const dupFile = existing().some(e => e.fileHash && e.fileHash === row.hash);
        const statusTag = row.status === 'locked' ? tag('wait', '암호 필요')
            : row.status === 'error' ? tag('fail', '읽을 수 없음')
                : row.autoId ? tag('pass', '자동 인식')
                    : row.candidates.length > 1 ? tag('wait', '후보 여럿') : tag('wait', '확인 필요');

        let controls;
        if (row.status === 'locked') {
            const input = el('input', {class: 'field', attrs: {type: 'password', placeholder: '비밀번호', autocomplete: 'off', 'aria-label': `${row.name} 비밀번호`}});
            const go = async () => {
                if (row.busy) return;
                await unlock(row, input.value);
                redraw();
            };
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
            controls = [
                // 비밀번호 칸은 회차 이름부터 미리보기까지 네 칸을 함께 쓴다. 칸이 좁아 단추 글자가 세로로 서던 것을 막는다
                td([el('div', {class: 'flex max-w-md items-center gap-2'}, [
                    el('div', {class: 'min-w-0 flex-1'}, [input]),
                    el('button', {class: 'btn shrink-0 whitespace-nowrap', text: '열기', attrs: {type: 'button', 'aria-label': `${row.name} 열기`}, on: {click: go}}),
                ])], '', {colspan: '4'}),
            ];
        } else if (row.status === 'ready') {
            const sheetNames = row.wb.worksheets.map(ws => ws.name);
            controls = [
                td([el('input', {
                    class: 'field', attrs: {value: row.key, placeholder: '예: 2026-03, 3, 사설', autocomplete: 'off', 'aria-label': `${row.name} 회차 이름`},
                    on: {change: (e) => { row.key = e.target.value; redraw(); }},
                })], 'min-w-40'),
                td([el('select', {class: 'field', attrs: {'aria-label': `${row.name} 진학 프로그램`}, on: {change: (e) => { row.formatId = e.target.value || null; redraw(); }}}, [
                    // 안내용 첫 항목은 고를 수 없다. 고를 수 있으면 인식된 양식이 빈 값으로 풀려 버린다
                    el('option', {text: '진학 프로그램 선택', attrs: {value: '', disabled: true, selected: !row.formatId}}),
                    ...Object.values(SCHEMAS).map(s => el('option', {
                        text: `${s.label}${s.id === row.autoId ? ' ✓' : ''}`, attrs: {value: s.id, selected: s.id === row.formatId},
                    })),
                ])], 'min-w-36'),
                td([sheetNames.length > 1
                    ? el('select', {class: 'field', attrs: {'aria-label': `${row.name} 시트`}, on: {change: (e) => { selectSheet(row, e.target.value); redraw(); }}},
                        sheetNames.map(n => el('option', {text: n, attrs: {value: n, selected: n === row.sheet}})))
                    : el('span', {class: 'text-ink-soft', text: row.sheet})], 'min-w-28'),
                td([el('button', {
                    class: 'btn btn-sm', text: row.preview ? '닫기' : '보기',
                    attrs: {type: 'button', 'aria-expanded': String(row.preview), 'aria-label': `${row.name} 미리보기`},
                    on: {click: () => { row.preview = !row.preview; redraw(); }},
                })]),
            ];
        } else {
            controls = [td([el('span', {class: 'text-fail', text: row.error})], '', {colspan: '4'})];
        }

        body.append(el('tr', {attrs: {'data-import': row.id}}, [
            td([el('input', {
                class: 'size-5 accent-brand',
                attrs: {type: 'checkbox', checked: row.include, disabled: row.status === 'error', 'aria-label': `${row.name} 불러오기`},
                on: {change: (e) => { row.include = e.target.checked; redraw(); }},
            })]),
            td([
                el('span', {class: 'block max-w-72 truncate font-semibold', text: row.name, attrs: {title: row.name}}),
                row.container ? el('span', {class: 'block text-ink-soft', text: `${row.container} 안`}) : null,
                row.error && row.status === 'locked' ? el('span', {class: 'block text-fail', text: row.error}) : null,
            ]),
            td([el('div', {class: 'flex flex-col items-start gap-1', attrs: {'aria-live': 'polite'}}, [
                statusTag,
                dupFile ? tag('wait', '이미 불러온 파일') : null,
                rowOutOfRange(row) ? tag('fail', `범위 밖 점수 ${rowOutOfRange(row)}개`) : null,
            ])]),
            ...controls,
            td([el('button', {
                class: 'btn btn-sm whitespace-nowrap', text: '제거', attrs: {type: 'button', 'aria-label': `${row.name} 목록에서 제거`},
                on: {click: () => { state.rows = state.rows.filter(r => r !== row); redraw(); }},
            })]),
        ]));
        if (row.preview && row.status === 'ready') {
            body.append(el('tr', {}, [el('td', {class: 'border-b border-line-soft bg-canvas px-3 py-3', attrs: {colspan: '8'}},
                [previewTable(row.wb.getWorksheet(row.sheet), SCHEMAS[row.formatId])])]));
        }
    }

    root.append(el('div', {class: 'card overflow-x-auto'}, [
        el('table', {class: 'w-full text-base'}, [
            el('thead', {}, [el('tr', {}, [th(''), th('파일'), th('상태'), th('회차 이름'), th('진학 프로그램'), th('시트'), th('미리보기'), th('')])]),
            body,
        ]),
    ]));

    if (focused) [...root.querySelectorAll('[aria-label]')].find(n => n.getAttribute('aria-label') === focused)?.focus();
    root.append(el('div', {class: 'mt-3 flex flex-wrap items-center gap-3'}, [
        el('p', {
            attrs: {id: 'import-note'},
            class: problems.length ? 'mr-auto text-base font-medium text-fail' : 'mr-auto text-base text-ink-soft',
            text: problems[0] ?? `${count}개 파일을 불러옵니다.`,
        }),
        el('button', {
            class: 'btn shrink-0', text: '목록 비우기', attrs: {type: 'button'},
            on: {click: () => { state.rows = []; state.skipped = []; redraw(); }},
        }),
        el('button', {
            class: 'btn btn-primary shrink-0', text: count ? `${count}개 회차 불러오기` : '불러오기',
            attrs: {type: 'button', disabled: problems.length > 0, id: 'import-commit'}, on: {click: () => onCommit()},
        }),
    ]));
}
