/* ───────────────────────────────────────────
   § renderAll() 공용 캐시 계산
   ST.data를 단 한 번만 순회하여 모든 렌더링 함수에
   필요한 집계 데이터를 미리 계산합니다.
─────────────────────────────────────────── */
function computeRenderCache(data, basis) {
    // [안전 장치] 데이터가 없으면 빈 객체 반환
    if (!data || !Array.isArray(data) || data.length === 0) {
        return {
            korScores: [], mathScores: [], engGrades: [], studentWithSums: [], basis,
            korSubjectStats: {}, mathSubjectStats: {}, inqSubjectStats: {}, csatSums: []
        };
    }

    const korScores = [];
    const mathScores = [];
    const engGrades = [];
    const studentWithSums = [];  // [{s, sum}]  — topN · 분포 공용
    const korSubjectStats = {};
    const mathSubjectStats = {};
    const inqSubjectStats = {};
    const csatSums = [];  // _getCsatRawSums(s) 결과, data와 동일 인덱스

    /* ── 선택과목 통계 누적 헬퍼 ── */
    const accSubject = (statsObj, subjectName, scoreObj) => {
        if (!subjectName || typeof subjectName !== 'string' || !subjectName.trim()) return;
        if (!statsObj[subjectName]) {
            statsObj[subjectName] = {
                count: 0,
                sumRaw: 0, validRawCount: 0,
                sumStd: 0, validStdCount: 0,
                sumPct: 0, validPctCount: 0,
                sumGrade: 0, validGradeCount: 0
            };
        }
        const d = statsObj[subjectName];
        d.count++;
        if (!scoreObj) return;

        let rawScore = 0, hasRaw = false;
        if (typeof scoreObj.common_raw === 'number' || typeof scoreObj.select_raw === 'number') {
            rawScore = (scoreObj.common_raw || 0) + (scoreObj.select_raw || 0);
            hasRaw = true;
        } else if (typeof scoreObj.raw === 'number') {
            rawScore = scoreObj.raw;
            hasRaw = true;
        }
        if (hasRaw) {
            d.sumRaw += rawScore;
            d.validRawCount++;
        }
        if (typeof scoreObj.std === 'number' && !Number.isNaN(scoreObj.std)) {
            d.sumStd += scoreObj.std;
            d.validStdCount++;
        }
        if (typeof scoreObj.pct === 'number' && !Number.isNaN(scoreObj.pct)) {
            d.sumPct += scoreObj.pct;
            d.validPctCount++;
        }
        if (typeof scoreObj.grade === 'number') {
            d.sumGrade += scoreObj.grade;
            d.validGradeCount++;
        }
    };

    data.forEach(s => {
        /* 1. 요약 통계용 점수 배열 */
        const korVal = s.korean?.[basis];
        const mathVal = s.math?.[basis];
        const engGrade = s.english?.grade;
        if (Number.isFinite(korVal)) korScores.push(korVal);
        if (Number.isFinite(mathVal)) mathScores.push(mathVal);
        if (Number.isFinite(engGrade)) engGrades.push(engGrade);

        /* 2. 4과목 합산 (상위N · 분포 공용) */
        let sum = 0;
        const subjects = ['korean', 'math', 'inquiry1', 'inquiry2'];

        subjects.forEach(subj => {
            const val = s[subj]?.[basis];

            // 수정된 조건: 타입이 숫자이고, NaN이 아닐 때만 합산
            if (typeof val === 'number' && !Number.isNaN(val)) {
                sum += val;
            }
        });

        studentWithSums.push({s, sum});

        /* 3. 선택과목별 집계 */
        accSubject(korSubjectStats, s.korean?.subject, s.korean);
        accSubject(mathSubjectStats, s.math?.subject, s.math);
        accSubject(inqSubjectStats, s.inquiry1?.subject, s.inquiry1);
        accSubject(inqSubjectStats, s.inquiry2?.subject, s.inquiry2);

        /* 4. 수능 최저 등급합 */
        csatSums.push(_getCsatRawSums(s));
    });

    return {
        basis,
        korScores, mathScores, engGrades,
        studentWithSums,
        korSubjectStats, mathSubjectStats, inqSubjectStats,
        csatSums
    };
}