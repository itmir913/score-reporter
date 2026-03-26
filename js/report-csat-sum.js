/* ───────────────────────────────────────────
   § 수능 최저학력기준 분석 로직
─────────────────────────────────────────── */

// [헬퍼] 학생의 등급 합을 계산하여 '숫자'로 반환 (통계용)
function _getCsatRawSums(student) {
    const grades = [];
    ['korean', 'math', 'english', 'inquiry1', 'inquiry2'].forEach(subj => {
        const score = student[subj];
        if (score && typeof score.grade === 'number' && score.grade > 0 && score.grade <= 9) {
            grades.push(score.grade);
        }
    });
    grades.sort((a, b) => a - b); // 좋은 등급 순 정렬
    const sumN = (n) => grades.length < n ? null : grades.slice(0, n).reduce((acc, val) => acc + val, 0);
    return {sum2: sumN(2), sum3: sumN(3), sum4: sumN(4), sum5: sumN(5)};
}

// [헬퍼] 기존 렌더링용: 숫자를 받아 HTML 태그로 변환
function _getCsatSums(student) {
    const raw = _getCsatRawSums(student);
    const format = (val) => val === null ? '<span class="text-slate-300">-</span>' : `<span class="font-extrabold text-base">${val}</span>`;
    return {sum2: format(raw.sum2), sum3: format(raw.sum3), sum4: format(raw.sum4), sum5: format(raw.sum5)};
}

// [헬퍼] 특정 기준 점수 합산
function _getScoreSum(student, basis) {
    let sum = 0;
    ['korean', 'math', 'inquiry1', 'inquiry2'].forEach(subj => {
        if (student[subj] && typeof student[subj][basis] === 'number') {
            sum += student[subj][basis];
        }
    });
    return sum;
}

// ★ 중복을 제거하고 하나로 합친 메인 렌더링 함수
function renderCsatMinRequirement() {
    if (!ST.data || ST.data.length === 0) return;

    // --- [새로 추가] 프린트용 통계표 렌더링 (이 호출이 누락되어 표가 나오지 않았습니다) ---
    renderCsatSummaryTable();

    // --- [1] 전교 석차 기준 렌더링 ---
    const limitElement = document.getElementById('top-n-count');
    const limit = limitElement ? parseInt(limitElement.value, 10) : 20;

    const sortedData = [...ST.data].sort((a, b) => {
        const aRaw = _getScoreSum(a, 'raw'), bRaw = _getScoreSum(b, 'raw');
        if (bRaw !== aRaw) return bRaw - aRaw;
        const aStd = _getScoreSum(a, 'std'), bStd = _getScoreSum(b, 'std');
        if (bStd !== aStd) return bStd - aStd;
        return _getScoreSum(b, 'pct') - _getScoreSum(a, 'pct');
    }).slice(0, limit);

    const schoolTbody = document.getElementById('csat-school-tbody');
    if (schoolTbody) {
        schoolTbody.innerHTML = sortedData.map((s, idx) => {
            const csat = _getCsatSums(s);
            return `
                <tr class="hover:bg-slate-50/50 transition-colors cursor-pointer group"
                data-name="${escapeAttr(s.name)}" data-class="${escapeAttr(s.class)}" data-num="${escapeAttr(s.number)}" onclick="handleRowClick(this)">
                    <td class="p-3 text-slate-500 font-medium">${idx + 1}</td>
                    <td class="p-3 text-slate-700">${s.class || ''}</td>
                    <td class="p-3 text-slate-700">${s.number || ''}</td>
                    <td class="p-3 text-left font-semibold text-slate-800">${s.name || ''}</td>
                    <td class="p-3 bg-blue-50/50 text-blue-700 border-x border-slate-100">${csat.sum2}</td>
                    <td class="p-3 bg-emerald-50/50 text-emerald-700 border-r border-slate-100">${csat.sum3}</td>
                    <td class="p-3 bg-violet-50/50 text-violet-700 border-r border-slate-100">${csat.sum4}</td>
                    <td class="p-3 bg-rose-50/50 text-rose-700">${csat.sum5}</td>
                </tr>
            `;
        }).join('');
    }

    // --- [2] 학급 드롭다운 설정 ---
    const classSelect = document.getElementById('class-select');
    if (classSelect) {
        const classes = [...new Set(ST.data.map(s => s.class).filter(c => c))]
            .sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));
        classSelect.innerHTML = classes.map(c => `<option value="${c}">${c}반 보기</option>`).join('');
        if (classes.length > 0) renderCsatClassTable();
    }
}

// [신규 기능] 전체 통계표(누적 인원) 렌더링
function renderCsatSummaryTable() {
    const maxSum = 15; // 분석을 보여줄 최대 합 (가로축 한계)
    const sums2 = Array(maxSum + 1).fill(0);
    const sums3 = Array(maxSum + 1).fill(0);
    const sums4 = Array(maxSum + 1).fill(0);
    const sums5 = Array(maxSum + 1).fill(0); // <-- 1. 5합용 배열 추가

    // 각 학생의 등급합을 확인해 누적으로 더함
    ST.data.forEach(s => {
        const raw = _getCsatRawSums(s);
        if (raw.sum2) {
            for (let i = raw.sum2; i <= maxSum; i++) sums2[i]++;
        }
        if (raw.sum3) {
            for (let i = raw.sum3; i <= maxSum; i++) sums3[i]++;
        }
        if (raw.sum4) {
            for (let i = raw.sum4; i <= maxSum; i++) sums4[i]++;
        }
        if (raw.sum5) {
            for (let i = raw.sum5; i <= maxSum; i++) sums5[i]++;
        } // <-- 2. 5합 누적 로직 추가
    });

    const thead = document.getElementById('csat-summary-thead');
    const tbody = document.getElementById('csat-summary-tbody');
    if (!thead || !tbody) return;

    // 1. 헤더 생성 (2 ~ 15합)
    let theadHtml = `<tr><th class="p-3 border-r border-slate-200 bg-slate-100 w-28">조건 이내</th>`;
    for (let i = 2; i <= maxSum; i++) {
        theadHtml += `<th class="p-3 w-12">${i}</th>`;
    }
    theadHtml += `</tr>`;
    thead.innerHTML = theadHtml;

    // 2. 행 생성 헬퍼
    const buildRow = (label, colorClass, dataArr, startIdx) => {
        let row = `<tr><td class="p-3 font-bold border-r border-slate-200 ${colorClass}">${label}</td>`;
        for (let i = 2; i <= maxSum; i++) {
            if (i < startIdx) {
                row += `<td class="p-3 text-slate-300 bg-slate-50">-</td>`;
            } else {
                const val = dataArr[i];
                row += `<td class="p-3 ${val > 0 ? 'font-bold text-slate-800' : 'text-slate-300'}">${val > 0 ? val + '명' : '-'}</td>`;
            }
        }
        row += `</tr>`;
        return row;
    };

    // 3. 본문 생성 (+ 기호와 sums5, 노란색 계열 클래스 반영)
    tbody.innerHTML =
        buildRow('2합', 'bg-blue-50 text-blue-700', sums2, 2) +
        buildRow('3합', 'bg-emerald-50 text-emerald-700', sums3, 3) +
        buildRow('4합', 'bg-violet-50 text-violet-700', sums4, 4) +
        buildRow('5합', 'bg-amber-50 text-amber-700', sums5, 5); // <-- 3. amber(노란/주황빛) 적용 및 sums5 사용
}

// 선택된 학급 테이블 렌더링
function renderCsatClassTable() {
    // ... 기존과 동일하게 유지 ...
    if (!ST.data || ST.data.length === 0) return;
    const classSelect = document.getElementById('class-select');
    if (!classSelect) return;

    const selectedClass = classSelect.value;

    const filteredData = ST.data.filter(s => s.class === selectedClass).sort((a, b) => {
        const numA = parseInt(a.number) || 999;
        const numB = parseInt(b.number) || 999;
        if (numA !== numB) return numA - numB;
        return (a.name || '').localeCompare(b.name || '');
    });

    const classTbody = document.getElementById('csat-class-tbody');
    if (classTbody) {
        classTbody.innerHTML = filteredData.map(s => {
            const csat = _getCsatSums(s);
            return `
                <tr class="hover:bg-slate-50/50 transition-colors cursor-pointer group"
                data-name="${escapeAttr(s.name)}" data-class="${escapeAttr(s.class)}" data-num="${escapeAttr(s.number)}" onclick="handleRowClick(this)">
                    <td class="p-3 text-slate-700">${s.number || ''}</td>
                    <td class="p-3 text-left font-semibold text-slate-800">${s.name || ''}</td>
                    <td class="p-3 bg-blue-50/50 text-blue-700 border-x border-slate-100">${csat.sum2}</td>
                    <td class="p-3 bg-emerald-50/50 text-emerald-700 border-r border-slate-100">${csat.sum3}</td>
                    <td class="p-3 bg-violet-50/50 text-violet-700 border-r border-slate-100">${csat.sum4}</td>
                    <td class="p-3 bg-rose-50/50 text-rose-700">${csat.sum5}</td>
                </tr>
            `;
        }).join('');
    }
}