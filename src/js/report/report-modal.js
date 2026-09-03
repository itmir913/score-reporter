import {ST} from '../main.js';
import {globalReportBasis} from '../report.js';
import {_getCsatRawSums} from './report-csat-sum.js';
import {escapeAttr} from '../utils.js';

/* ───────────────────────────────────────────
   § 모달 제어 및 상세 정보 표시
─────────────────────────────────────────── */

export let _printStudent = null;

/**
 * 모달 열고 닫기 공통 함수
 */
export function openModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
    // 모달을 표시하는 코드 아래에 추가
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden'; // html까지 확실하게 잠금
}

export function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
    const anyOpen = ['bin-students-modal', 'student-modal', 'csat-list-modal']
        .some(id => !document.getElementById(id).classList.contains('hidden'));
    if (!anyOpen) {
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
    }
}

/**
 * 행 클릭 시 데이터를 읽어와 상세 모달을 띄우는 핸들러
 */
export function handleRowClick(el) {
    const name = el.dataset.name;
    const cls = el.dataset.class;
    const num = el.dataset.num;

    // 기존에 사용하던 상세 보기 함수 호출
    showStudentDetail(name, cls, num);
}


/**
 * 구간별 학생 명단 팝업 (차트 클릭 시 호출)
 */
export function showBinStudentsModal(label, students) {
    const basis = globalReportBasis;

    // 1. 반, 번호, 이름 순으로 정렬
    students.sort((a, b) => {
        // 1. 반(class) 비교 (안전한 문자/숫자 혼합 오름차순)
        const classA = String(a.class || "");
        const classB = String(b.class || "");
        if (classA !== classB) {
            return classA.localeCompare(classB, undefined, {numeric: true});
        }

        // 2. 번호(number) 비교 (안전한 문자/숫자 혼합 오름차순)
        const numA = String(a.number || "");
        const numB = String(b.number || "");
        if (numA !== numB) {
            return numA.localeCompare(numB, undefined, {numeric: true});
        }

        // 3. 이름(name) 비교 (가나다순, null/undefined 에러 방어)
        const nameA = String(a.name || "");
        const nameB = String(b.name || "");
        return nameA.localeCompare(nameB);
    });

    // 2. 타이틀 세팅
    document.getElementById('bin-modal-title').innerText = `[${label}] 학생 명단 (${students.length}명)`;

    // 3. tbody 내용 삽입 (td에 border-b만 남겨서 깔끔하게 표시)
    const tbody = document.getElementById('bin-modal-tbody');
    tbody.innerHTML = students.map(s => {
        const sum = ['korean', 'math', 'inquiry1', 'inquiry2'].reduce((acc, cur) => acc + (s[cur]?.[basis] || 0), 0);
        return `
            <tr class="hover:bg-blue-50 cursor-pointer transition-colors group"
                data-name="${escapeAttr(s.name)}" data-class="${escapeAttr(s.class)}" data-num="${escapeAttr(s.number)}" data-action="row-click">
                <td class="border-b border-slate-200 p-3 text-slate-600">${escapeAttr(s.class)}반</td>
                <td class="border-b border-slate-200 p-3 text-slate-600">${escapeAttr(s.number)}번</td>
                <td class="border-b border-slate-200 p-3 font-bold text-slate-800">${escapeAttr(s.name)}</td>
                <td class="border-b border-slate-200 p-3 text-blue-600 font-bold">
                    ${sum.toFixed(basis === 'pct' ? 1 : 0)}
                </td>
                <td class="border-b border-slate-200 p-3 text-base text-slate-400 group-hover:text-blue-500 font-medium">
                    상세보기 >
                </td>
            </tr>
        `;
    }).join('');

    if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="p-12 text-slate-400">해당 구간에 학생이 없습니다.</td></tr>';
    }

    // 4. 명단 모달 표시 및 스크롤 초기화
    openModal('bin-students-modal');
}

/**
 * 개별 학생 상세 성적표 팝업 (명단 클릭 시 호출)
 */
export function showStudentDetail(name, cls, num) {
    const s = ST.data.find(item => item.name === name && item.class === cls && item.number === num);
    if (!s) return;
    _printStudent = s;

    document.getElementById('modal-student-info').innerText = `${s.class}반 ${s.number}번 ${s.name} 성적표`;

    const rows = [{label: '국어', data: s.korean}, {label: '수학', data: s.math}, {
        label: '영어',
        data: s.english,
        isAbs: true
    }, {label: '한국사', data: s.hist, isAbs: true}, {label: '탐구1', data: s.inquiry1}, {
        label: '탐구2',
        data: s.inquiry2
    }, {label: '제2외국어', data: s.fl2, isAbs: true}];

    const tbody = document.getElementById('modal-score-tbody');
    tbody.innerHTML = rows.map(r => {
        const d = r.data || {};
        const isAbs = r.isAbs;

        // 공통+선택 점수를 합산하거나, 그냥 raw 점수를 가져옵니다.
        let totalRaw = '-';
        if (typeof d.common_raw === 'number' || typeof d.select_raw === 'number') {
            totalRaw = (d.common_raw || 0) + (d.select_raw || 0);
        } else if (typeof d.raw === 'number') {
            totalRaw = d.raw;
        }

        return `
            <tr class="hover:bg-slate-50">
                <td class="border border-slate-300 p-2 bg-emerald-50 font-bold">${r.label}</td>
                <td class="border border-slate-300 p-2">${escapeAttr(d.subject) || '-'}</td>
                <td class="border border-slate-300 p-2 font-bold">${totalRaw}</td>
                <td class="border border-slate-300 p-2">${isAbs ? '-' : escapeAttr(d.std ?? '-')}</td>
                <td class="border border-slate-300 p-2">${isAbs ? '-' : escapeAttr(d.pct ?? '-')}</td>
                <td class="border border-slate-300 p-2 font-bold text-blue-600">${escapeAttr(d.grade ?? '-')}</td>
            </tr>
        `;
    }).join('');

    openModal('student-modal');
}

/**
 * 선택과목별 학생 명단 모달 띄우기
 */
export function showSelectedSubjectStudents(type, subjectName) {
    if (!ST.data || ST.data.length === 0) return;

    const filtered = ST.data.filter(s => {
        if (type === 'kor') return s.korean?.subject === subjectName;
        if (type === 'math') return s.math?.subject === subjectName;
        if (type === 'inq') return s.inquiry1?.subject === subjectName || s.inquiry2?.subject === subjectName;
        return false;
    });

    // 기존에 있는 모달 함수 호출
    showBinStudentsModal(`${subjectName} 선택`, filtered);
}


/* ───────────────────────────────────────────
   § 수능 최저 충족 학생 명단 모달 띄우기
─────────────────────────────────────────── */
export function showCsatStudents(n, targetSum) {
    if (!ST.data) return;

    // 1. 해당 조건(n합 targetSum 이하)을 만족하는 학생 필터링
    const targetStudents = ST.data.filter(s => {
        const raw = _getCsatRawSums(s);
        const actualSum = raw[`sum${n}`]; // sum2, sum3, sum4, sum5
        return actualSum !== null && actualSum <= targetSum;
    });

    // 2. 반(class) > 학번(number) > 이름(name) 순으로 정렬
    targetStudents.sort((a, b) => {
        // 1순위: 반(class) 비교 (안전한 문자/숫자 혼합 오름차순)
        const classA = String(a.class || "");
        const classB = String(b.class || "");
        if (classA !== classB) {
            return classA.localeCompare(classB, undefined, {numeric: true});
        }

        // 2순위: 번호(number) 비교 (반이 같을 때만 실행됨)
        const numA = String(a.number || "");
        const numB = String(b.number || "");
        if (numA !== numB) {
            return numA.localeCompare(numB, undefined, {numeric: true});
        }

        // 3순위: 이름(name) 사전순 비교 (반과 번호가 모두 같을 때만 실행됨)
        const nameA = String(a.name || "");
        const nameB = String(b.name || "");
        return nameA.localeCompare(nameB);
    });

    // 3. 모달 테이블 내용 렌더링
    const tbody = document.getElementById('csat-list-modal-tbody');
    // report.js 의 showCsatStudents 함수 내 tbody 렌더링 부분
    if (tbody) {
        tbody.innerHTML = targetStudents.map(s => {
            const raw = _getCsatRawSums(s);
            const actualSum = raw[`sum${n}`];
            const actualSubj = raw[`sum${n}_subj`]; // 새로 추가된 과목명 데이터 가져오기
            return `
                <tr class="hover:bg-slate-50/50 transition-colors cursor-pointer group"
                    data-name="${escapeAttr(s.name)}" data-class="${escapeAttr(s.class)}" data-num="${escapeAttr(s.number)}" data-action="row-click">
                    <td class="border border-slate-300 p-3 text-slate-700">${escapeAttr(s.class) || ''}반 ${escapeAttr(s.number) || ''}번</td>
                    <td class="border border-slate-300 p-3 font-bold text-slate-800">${escapeAttr(s.name) || ''}</td>
                    <td class="border border-slate-300 p-3 text-blue-600 font-bold">${actualSum}</td>
                    <td class="border border-slate-300 p-3 text-blue-600 font-bold">${escapeAttr(actualSubj || '-')}</td>
                </tr>
            `;
        }).join('');
    }

    // 4. 모달 제목 렌더링 (예: "3합 6 이내 충족 명단 (15명)")
    const title = document.getElementById('csat-list-modal-title');
    if (title) {
        title.innerHTML = `<span class="text-blue-600">${n}합 ${targetSum}</span> 충족 명단 <span class="text-slate-500 text-base font-medium">(${targetStudents.length}명)</span>`;
    }

    // 5. 모달 열기 (기존의 openModal 함수 활용)
    openModal('csat-list-modal');
}

/* ───────────────────────────────────────────
   § 개별 학생 성적통지표 팝업 인쇄
─────────────────────────────────────────── */
export function printStudentDetail() {
    const s = _printStudent;
    if (!s) return;

    const examYear = s.exam_year ? `${s.exam_year}학년도 ` : '';
    const title = `${examYear}모의고사 성적표`;

    // 원점수 표시 헬퍼
    const fmtRaw = (subj) => {
        const d = s[subj];
        if (!d) return '-';
        if (typeof d.common_raw === 'number' && typeof d.select_raw === 'number') {
            return `공통 ${d.common_raw} + 선택 ${d.select_raw}<br><span style="font-size:11px;color:#555">(합계 ${d.common_raw + d.select_raw})</span>`;
        }
        if (typeof d.common_raw === 'number') return String(d.common_raw);
        if (typeof d.select_raw === 'number') return String(d.select_raw);
        return typeof d.raw === 'number' ? String(d.raw) : '-';
    };
    const fmtNum = (v) => (typeof v === 'number') ? String(v) : '-';
    const fmtSubj = (subj) => {
        const d = s[subj];
        return (d && d.subject) ? escapeAttr(d.subject) : '-';
    };

    // 제2외국어 존재 여부
    const hasFl2 = s.fl2 && (s.fl2.subject || typeof s.fl2.raw === 'number' || typeof s.fl2.grade === 'number');

    const fl2SubjCell  = hasFl2 ? fmtSubj('fl2') : '-';
    const fl2RawCell   = hasFl2 ? fmtRaw('fl2')  : '-';
    const fl2DashCell = `<td>-</td>`;
    const fl2GradeCell = hasFl2 ? fmtNum(s.fl2?.grade) : '-';

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${escapeAttr(title)}</title>
<style>
  @page { size: A4 portrait; margin: 20mm 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: '맑은 고딕', 'Malgun Gothic', sans-serif; font-size: 13px; color: #000; }
  h1 { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 14px; letter-spacing: -0.3px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; table-layout: fixed; }
  th, td { border: 1px solid #000; padding: 5px 4px; text-align: center; vertical-align: middle; }
  thead th { background: #f0f0f0; font-weight: bold; }
  .info-label { background: #f0f0f0; font-weight: bold; font-size: 12px; }
  .row-label { background: #f7f7f7; font-weight: bold; font-size: 12px; white-space: nowrap; }
  .score-big { font-size: 14px; }
  .notice { font-size: 10px; color: #444; margin-top: 8px; }
  .btn-wrap { text-align: center; margin: 16px 0 0; }
  .btn-print { padding: 7px 24px; font-size: 13px; cursor: pointer; background: #1d4ed8; color: #fff; border: none; border-radius: 6px; }
  .btn-close { padding: 7px 24px; font-size: 13px; cursor: pointer; background: #6b7280; color: #fff; border: none; border-radius: 6px; margin-left: 8px; }
  @media print { .btn-wrap { display: none; } }
</style>
</head>
<body>
<h1>${escapeAttr(title)}</h1>

<table>
  <colgroup>
    <col style="width:20%">
    <col style="width:20%">
    <col style="width:20%">
    <col style="width:40%">
  </colgroup>
  <thead>
    <tr>
      <th class="info-label">학년</th>
      <th class="info-label">반</th>
      <th class="info-label">번호</th>
      <th class="info-label">성&nbsp;&nbsp;&nbsp;명</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>${escapeAttr(s.grade_year) || '-'}</td>
      <td>${escapeAttr(s.class) || '-'}</td>
      <td>${escapeAttr(s.number) || '-'}</td>
      <td style="font-weight:bold;font-size:14px;">${escapeAttr(s.name)}</td>
    </tr>
  </tbody>
</table>

<table>
  <colgroup>
    <col style="width:72px">
    <col span="7">
  </colgroup>
  <thead>
    <tr>
      <th rowspan="2" class="row-label" style="width:72px;">영역</th>
      <th rowspan="2">한국사</th>
      <th rowspan="2">국어</th>
      <th rowspan="2">수학</th>
      <th rowspan="2">영어</th>
      <th colspan="2">탐구</th>
      <th rowspan="2">제2외국어<br>/한문</th>
    </tr>
    <tr>
      <th>탐구1</th>
      <th>탐구2</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td class="row-label">선택과목</td>
      <td>-</td>
      <td>${fmtSubj('korean')}</td>
      <td>${fmtSubj('math')}</td>
      <td>-</td>
      <td>${fmtSubj('inquiry1')}</td>
      <td>${fmtSubj('inquiry2')}</td>
      <td>${fl2SubjCell}</td>
    </tr>
    <tr>
      <td class="row-label">원점수</td>
      <td>${fmtRaw('hist')}</td>
      <td>${fmtRaw('korean')}</td>
      <td>${fmtRaw('math')}</td>
      <td>${fmtRaw('english')}</td>
      <td>${fmtRaw('inquiry1')}</td>
      <td>${fmtRaw('inquiry2')}</td>
      <td>${fl2RawCell}</td>
    </tr>
    <tr>
      <td class="row-label">표준점수</td>
      <td>-</td>
      <td class="score-big">${fmtNum(s.korean?.std)}</td>
      <td class="score-big">${fmtNum(s.math?.std)}</td>
      <td>-</td>
      <td class="score-big">${fmtNum(s.inquiry1?.std)}</td>
      <td class="score-big">${fmtNum(s.inquiry2?.std)}</td>
      ${fl2DashCell}
    </tr>
    <tr>
      <td class="row-label">백분위</td>
      <td>-</td>
      <td class="score-big">${fmtNum(s.korean?.pct)}</td>
      <td class="score-big">${fmtNum(s.math?.pct)}</td>
      <td>-</td>
      <td class="score-big">${fmtNum(s.inquiry1?.pct)}</td>
      <td class="score-big">${fmtNum(s.inquiry2?.pct)}</td>
      ${fl2DashCell}
    </tr>
    <tr>
      <td class="row-label">등급</td>
      <td class="score-big">${fmtNum(s.hist?.grade)}</td>
      <td class="score-big">${fmtNum(s.korean?.grade)}</td>
      <td class="score-big">${fmtNum(s.math?.grade)}</td>
      <td class="score-big">${fmtNum(s.english?.grade)}</td>
      <td class="score-big">${fmtNum(s.inquiry1?.grade)}</td>
      <td class="score-big">${fmtNum(s.inquiry2?.grade)}</td>
      <td class="score-big">${fl2GradeCell}</td>
    </tr>
  </tbody>
</table>

<p class="notice">★ 본 성적표는 성적을 통지하기 위한 용도이며, 다른 용도로는 사용할 수 없습니다.</p>

<!-- 이 두 개만 인라인으로 남는다. 아래에서 window.open으로 여는 별도 문서라
     우리 스크립트가 닿지 않고, 부르는 것도 그 창 자신의 print/close다. -->
<div class="btn-wrap">
  <button class="btn-print" onclick="window.print()">인쇄</button>
  <button class="btn-close" onclick="window.close()">닫기</button>
</div>
</body>
</html>`;

    const pw = window.open('', '_blank', 'width=800,height=620');
    if (!pw) {
        alert('팝업이 차단되었습니다. 브라우저의 팝업 허용 설정을 확인해주세요.');
        return;
    }
    pw.document.write(html);
    pw.document.close();
}

/* ───────────────────────────────────────────
   § ESC 키로 모달 닫기
─────────────────────────────────────────── */
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const order = ['student-modal', 'bin-students-modal', 'csat-list-modal'];
    const top = order.find(id => !document.getElementById(id).classList.contains('hidden'));
    if (top) closeModal(top);
});