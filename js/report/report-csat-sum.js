/* ───────────────────────────────────────────
   § 수능 최저학력기준 분석 로직
─────────────────────────────────────────── */

function _getCsatRawSums(student) {
    // 과목명 매핑을 위한 객체
    const subjNames = {
        korean: '국어', math: '수학', english: '영어', inquiry1: '탐구1', inquiry2: '탐구2'
    };

    const grades = [];
    ['korean', 'math', 'english', 'inquiry1', 'inquiry2'].forEach(subj => {
        const score = student[subj];
        if (score && typeof score.grade === 'number' && score.grade > 0 && score.grade <= 9) {
            // 점수만 넣는 대신 과목명도 함께 저장
            grades.push({grade: score.grade, name: subjNames[subj]});
        }
    });

    // 등급 기준 오름차순 정렬 (낮은 등급이 먼저 오도록)
    grades.sort((a, b) => {
        // [핵심 수정] 등급(grade) 결측치나 문자열 예외 상황 완벽 방어
        const gradeA = String(a.grade || "");
        const gradeB = String(b.grade || "");

        return gradeA.localeCompare(gradeB, undefined, {numeric: true});
    });

    // n개의 과목 합산 및 이름 조합 헬퍼 함수
    const getSumData = (n) => {
        if (grades.length < n) return {sum: null, subjects: ''};
        const selected = grades.slice(0, n);
        return {
            sum: selected.reduce((acc, val) => acc + val.grade, 0),
            subjects: selected.map(g => g.name).join('+')
        };
    };

    const res2 = getSumData(2), res3 = getSumData(3), res4 = getSumData(4), res5 = getSumData(5);

    // 기존 집계 함수들(renderCsatSummaryTable 등)이 깨지지 않게 sum2~sum5는 숫자로 유지하고,
    // 표시를 위한 텍스트(_subj)를 추가로 반환합니다.
    return {
        sum2: res2.sum, sum2_subj: res2.subjects,
        sum3: res3.sum, sum3_subj: res3.subjects,
        sum4: res4.sum, sum4_subj: res4.subjects,
        sum5: res5.sum, sum5_subj: res5.subjects
    };
}

function _getCsatSums(student) {
    const raw = _getCsatRawSums(student);
    const format = (val, subj) => val === null
        ? '<span class="text-slate-300">-</span>'
        : `<div class="flex flex-col">
               <span class="font-extrabold text-base">${val}</span>
               <span class="text-base text-slate-500 font-normal mt-0.5">(${subj})</span>
           </div>`;
    return {
        sum2: format(raw.sum2, raw.sum2_subj),
        sum3: format(raw.sum3, raw.sum3_subj),
        sum4: format(raw.sum4, raw.sum4_subj),
        sum5: format(raw.sum5, raw.sum5_subj)
    };
}

function _getScoreSum(student, basis) {
    let sum = 0;
    ['korean', 'math', 'inquiry1', 'inquiry2'].forEach(subj => {
        if (student[subj] && typeof student[subj][basis] === 'number') {
            sum += student[subj][basis];
        }
    });
    return sum;
}

/* ── 메인 렌더링 함수 ── */
function renderCsatMinRequirement(cache) {
    if (!ST.data || ST.data.length === 0) return;

    // ★ cache 전달
    renderCsatSummaryTable(cache);

    // --- 전교 석차 기준 (원점수 기준 정렬 — globalReportBasis와 무관) ---
    const limitElement = document.getElementById('csat-top-n-count');
    const limit = limitElement
        ? (limitElement.value === 'all' ? Infinity : parseInt(limitElement.value, 10))
        : 20;

    const sortedData = [...ST.data].sort((a, b) => {
        // [핵심 수정] Number() 캐스팅과 || 0 을 통해 NaN, null, undefined를 0점으로 안전하게 치환
        const aRaw = Number(_getScoreSum(a, 'raw')) || 0;
        const bRaw = Number(_getScoreSum(b, 'raw')) || 0;
        if (bRaw !== aRaw) return bRaw - aRaw;

        const aStd = Number(_getScoreSum(a, 'std')) || 0;
        const bStd = Number(_getScoreSum(b, 'std')) || 0;
        if (bStd !== aStd) return bStd - aStd;

        const aPct = Number(_getScoreSum(a, 'pct')) || 0;
        const bPct = Number(_getScoreSum(b, 'pct')) || 0;

        return bPct - aPct;
    }).slice(0, limit);

    const schoolTbody = document.getElementById('csat-school-tbody');
    if (schoolTbody) {
        schoolTbody.innerHTML = sortedData.map((s, idx) => {
            const csat = _getCsatSums(s);
            return `
                <tr class="hover:bg-slate-50/50 transition-colors cursor-pointer group"
                    data-name="${escapeAttr(s.name)}" data-class="${escapeAttr(s.class)}" data-num="${escapeAttr(s.number)}"
                    onclick="handleRowClick(this)">
                    <td class="p-3 text-slate-500 font-medium">${idx + 1}</td>
                    <td class="p-3 text-slate-700">${s.class || ''}</td>
                    <td class="p-3 text-slate-700">${s.number || ''}</td>
                    <td class="p-3 text-left font-semibold text-slate-800">${s.name || ''}</td>
                    <td class="p-3 bg-blue-50/50 text-blue-700 border-x border-slate-100">${csat.sum2}</td>
                    <td class="p-3 bg-emerald-50/50 text-emerald-700 border-r border-slate-100">${csat.sum3}</td>
                    <td class="p-3 bg-amber-50/50 text-amber-700 border-r border-slate-100">${csat.sum4}</td>
                    <td class="p-3 bg-rose-50/50 text-rose-700">${csat.sum5}</td>
                </tr>
            `;
        }).join('');
    }

    const classSelect = document.getElementById('class-select');
    if (classSelect) {
        const classes = [...new Set(ST.data.map(s => s.class).filter(c => c))]
            .sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));
        classSelect.innerHTML = classes.map(c => `<option value="${c}">${c}반 보기</option>`).join('');
        if (classes.length > 0) renderCsatClassTable(cache);
    }
}

/* ── 전체 통계표 (누적 인원) ── */
function renderCsatSummaryTable(cache) {
    const maxSum = 15;
    const sums2 = Array(maxSum + 1).fill(0);
    const sums3 = Array(maxSum + 1).fill(0);
    const sums4 = Array(maxSum + 1).fill(0);
    const sums5 = Array(maxSum + 1).fill(0);

    // ★ 캐시에서 직접 사용 — _getCsatRawSums() 재호출 없음
    cache.csatSums.forEach(raw => {
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
        }
    });

    const thead = document.getElementById('csat-summary-thead');
    const tbody = document.getElementById('csat-summary-tbody');
    if (!thead || !tbody) return;

    let theadHtml = `<tr><th class="p-3 border-r border-slate-200 bg-slate-100 w-28">조건 이내</th>`;
    for (let i = 2; i <= maxSum; i++) theadHtml += `<th class="p-3 w-12">${i}</th>`;
    theadHtml += `</tr>`;
    thead.innerHTML = theadHtml;

    const buildRow = (label, colorClass, dataArr, startIdx, nSum) => {
        let row = `<tr><td class="p-3 font-bold border-r border-slate-200 ${colorClass}">${label}</td>`;
        for (let i = 2; i <= maxSum; i++) {
            if (i < startIdx) {
                row += `<td class="p-3 text-slate-300 bg-slate-50">-</td>`;
            } else {
                const val = dataArr[i];
                row += val > 0
                    ? `<td class="p-3 font-bold text-slate-800 cursor-pointer hover:bg-slate-100 transition-colors"
                           onclick="showCsatStudents(${nSum}, ${i})">
                           <span class="underline underline-offset-2 decoration-slate-300 hover:decoration-slate-500">${val}명</span>
                       </td>`
                    : `<td class="p-3 text-slate-300">-</td>`;
            }
        }
        return row + `</tr>`;
    };

    tbody.innerHTML =
        buildRow('2합', 'bg-blue-50 text-blue-700', sums2, 2, 2) +
        buildRow('3합', 'bg-emerald-50 text-emerald-700', sums3, 3, 3) +
        buildRow('4합', 'bg-amber-50 text-amber-700', sums4, 4, 4) +
        buildRow('5합', 'bg-rose-50 text-rose-700', sums5, 5, 5);
}

/* ── 학급 테이블 ── */
function handleClassChange() {
    // ST.cache가 있는지 확인 (renderAll에서 ST.cache = cache; 를 해줘야 함)
    if (ST.cache) {
        renderCsatClassTable(ST.cache);
    } else {
        // 캐시가 없으면 전체를 다시 그려서 캐시를 생성하게 함
        if (typeof renderAll === 'function') renderAll();
    }
}

/**
 * 학급별 수능 최저 학력 기준 충족 현황 렌더링
 * @param {Object} cache - renderAll에서 생성된 캐시 데이터
 */
function renderCsatClassTable(cache) {
    if (!ST.data || ST.data.length === 0 || !cache || !cache.csatSums) {
        console.error("캐시 데이터가 준비되지 않았습니다.");
        return;
    }

    const classSelect = document.getElementById('class-select');
    if (!classSelect) return;

    const selectedClass = classSelect.value;

    // 1. ST.data와 cache.csatSums를 인덱스로 매핑하여 데이터 준비
    // filter 이전에 미리 매핑된 객체 배열을 만들어 인덱스 유실 방지
    const mappedData = ST.data
        .map((s, index) => ({
            s,
            csat: cache.csatSums[index]
        }))
        .filter(item => String(item.s.class) === String(selectedClass)) // 타입 불일치 방지용 String 변환 유지
        .sort((a, b) => {
            // [핵심 수정] parseInt의 한계를 벗어나 문자/숫자 혼합 데이터를 자연스럽게 정렬
            const numA = String(a.s.number || "");
            const numB = String(b.s.number || "");

            return numA.localeCompare(numB, undefined, {numeric: true});
        });

    const classTbody = document.getElementById('csat-class-tbody');
    if (classTbody) {
        if (mappedData.length === 0) {
            classTbody.innerHTML = `<tr><td colspan="6" class="p-8 text-slate-400 text-center">해당 반의 데이터가 없습니다.</td></tr>`;
            return;
        }

        const fmtCsat = (val, subj) => val === null
            ? '<span class="text-slate-300">-</span>'
            : `<div class="flex flex-col">
                   <span class="font-extrabold text-base">${val}</span>
                   <span class="text-base text-slate-500 font-normal mt-0.5">(${subj})</span>
               </div>`;

        classTbody.innerHTML = mappedData.map(({s, csat}) => `
            <tr class="hover:bg-slate-50/50 transition-colors cursor-pointer group" data-name="${escapeAttr(s.name)}" data-class="${escapeAttr(s.class)}" data-num="${escapeAttr(s.number)}" onclick="handleRowClick(this)">
                <td class="p-3 text-slate-700">${s.number || ''}</td>
                <td class="p-3 text-left font-semibold text-slate-800">${s.name || ''}</td>
                <td class="p-3 bg-blue-50/50 text-blue-700 border-x border-slate-100">${fmtCsat(csat.sum2, csat.sum2_subj)}</td>
                <td class="p-3 bg-emerald-50/50 text-emerald-700 border-r border-slate-100">${fmtCsat(csat.sum3, csat.sum3_subj)}</td>
                <td class="p-3 bg-amber-50/50 text-amber-700 border-r border-slate-100">${fmtCsat(csat.sum4, csat.sum4_subj)}</td>
                <td class="p-3 bg-rose-50/50 text-rose-700">${fmtCsat(csat.sum5, csat.sum5_subj)}</td>
            </tr>
        `).join('');
    }
}