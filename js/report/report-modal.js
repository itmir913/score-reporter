/* ───────────────────────────────────────────
   § 모달 제어 및 상세 정보 표시
─────────────────────────────────────────── */

/**
 * 모달 열고 닫기 공통 함수
 */
function openModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
    // 모달을 표시하는 코드 아래에 추가
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden'; // html까지 확실하게 잠금
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
    // body와 html 모두 스크롤 제한 해제
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
}

/**
 * 행 클릭 시 데이터를 읽어와 상세 모달을 띄우는 핸들러
 */
function handleRowClick(el) {
    const name = el.dataset.name;
    const cls = el.dataset.class;
    const num = el.dataset.num;

    // 기존에 사용하던 상세 보기 함수 호출
    showStudentDetail(name, cls, num);
}


/**
 * 구간별 학생 명단 팝업 (차트 클릭 시 호출)
 */
function showBinStudentsModal(label, students) {
    const basis = globalReportBasis;

    // 1. 반, 번호, 이름 순으로 정렬
    students.sort((a, b) => {
        // 1. 반(class) 비교 (오름차순)
        if (Number(a.class) !== Number(b.class)) {
            return Number(a.class) - Number(b.class);
        }
        // 2. 번호(number) 비교 (오름차순)
        if (Number(a.number) !== Number(b.number)) {
            return Number(a.number) - Number(b.number);
        }
        // 3. 이름(name) 비교 (가나다순)
        return a.name.localeCompare(b.name);
    });

    // 2. 타이틀 세팅
    document.getElementById('bin-modal-title').innerText = `[${label}] 학생 명단 (${students.length}명)`;

    // 3. tbody 내용 삽입 (td에 border-b만 남겨서 깔끔하게 표시)
    const tbody = document.getElementById('bin-modal-tbody');
    tbody.innerHTML = students.map(s => {
        const sum = ['korean', 'math', 'inquiry1', 'inquiry2'].reduce((acc, cur) => acc + (s[cur]?.[basis] || 0), 0);
        return `
            <tr class="hover:bg-blue-50 cursor-pointer transition-colors group" 
                data-name="${escapeAttr(s.name)}" data-class="${escapeAttr(s.class)}" data-num="${escapeAttr(s.number)}" onclick="handleRowClick(this)">
                <td class="border-b border-slate-200 p-3 text-slate-600">${s.class}반</td>
                <td class="border-b border-slate-200 p-3 text-slate-600">${s.number}번</td>
                <td class="border-b border-slate-200 p-3 font-bold text-slate-800">${s.name}</td>
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
function showStudentDetail(name, cls, num) {
    const s = ST.data.find(item => item.name === name && item.class === cls && item.number === num);
    if (!s) return;

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
                <td class="border border-slate-300 p-2">${d.subject || '-'}</td>
                <td class="border border-slate-300 p-2 font-bold">${totalRaw}</td> <td class="border border-slate-300 p-2">${isAbs ? '-' : (d.std || '-')}</td>
                <td class="border border-slate-300 p-2">${isAbs ? '-' : (d.pct || '-')}</td>
                <td class="border border-slate-300 p-2 font-bold text-blue-600">${d.grade || '-'}</td>
            </tr>
        `;
    }).join('');

    openModal('student-modal');
}

/**
 * 선택과목별 학생 명단 모달 띄우기
 */
function showSelectedSubjectStudents(type, subjectName) {
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
function showCsatStudents(n, targetSum) {
    if (!ST.data) return;

    // 1. 해당 조건(n합 targetSum 이하)을 만족하는 학생 필터링
    const targetStudents = ST.data.filter(s => {
        const raw = _getCsatRawSums(s);
        const actualSum = raw[`sum${n}`]; // sum2, sum3, sum4, sum5
        return actualSum !== null && actualSum <= targetSum;
    });

    // 2. 반(class) > 학번(number) > 이름(name) 순으로 정렬
    targetStudents.sort((a, b) => {
        // 1순위: 반(class) 비교
        const classA = parseInt(a.class) || 9999;
        const classB = parseInt(b.class) || 9999;
        if (classA !== classB) return classA - classB;

        // 2순위: 번호(number) 비교 (반이 같을 때만 실행됨)
        const numA = parseInt(a.number) || 9999;
        const numB = parseInt(b.number) || 9999;
        if (numA !== numB) return numA - numB;

        // 3순위: 이름(name) 사전순 비교 (반과 번호가 모두 같을 때만 실행됨)
        return (a.name || '').localeCompare(b.name || '');
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
                    data-name="${escapeAttr(s.name)}" data-class="${escapeAttr(s.class)}" data-num="${escapeAttr(s.number)}" onclick="handleRowClick(this)">
                    <td class="border border-slate-300 p-3 text-slate-700">${s.class || ''}반 ${s.number || ''}번</td>
                    <td class="border border-slate-300 p-3 font-bold text-slate-800">${s.name || ''}</td>
                    <td class="border border-slate-300 p-3 text-blue-600 font-bold">${actualSum}</td>
                    <td class="border border-slate-300 p-3 text-blue-600 font-bold">${actualSubj}</td>
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