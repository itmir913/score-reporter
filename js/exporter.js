/* ───────────────────────────────────────────
   § GradeExporter 클래스
─────────────────────────────────────────── */
class GradeExporter {
    static toXlsx(students, target, fileName) {
        // 스키마 인덱스 중 가장 큰 값(가장 우측 컬럼) 계산
        const maxCol = Math.max(...Object.values(target._idx).filter(i => i !== null && i !== undefined));

        const getVal = (s, key) => {
            const MAP = {
                grade_year: 'grade_year',
                class: 'class',
                number: 'number',
                name: 'name',
                kor_subject: s => s.korean.subject,
                kor_common_raw: s => s.korean.common_raw,
                kor_select_raw: s => s.korean.select_raw,
                kor_raw: s => s.korean.raw,
                kor_std: s => s.korean.std,
                kor_pct: s => s.korean.pct,
                kor_grade: s => s.korean.grade,
                math_subject: s => s.math.subject,
                math_common_raw: s => s.math.common_raw,
                math_select_raw: s => s.math.select_raw,
                math_raw: s => s.math.raw,
                math_std: s => s.math.std,
                math_pct: s => s.math.pct,
                math_grade: s => s.math.grade,
                eng_raw: s => s.english.raw,
                eng_std: s => s.english.std,
                eng_pct: s => s.english.pct,
                eng_grade: s => s.english.grade,
                inq1_subject: s => s.inquiry1.subject,
                inq1_raw: s => s.inquiry1.raw,
                inq1_std: s => s.inquiry1.std,
                inq1_pct: s => s.inquiry1.pct,
                inq1_grade: s => s.inquiry1.grade,
                inq2_subject: s => s.inquiry2.subject,
                inq2_raw: s => s.inquiry2.raw,
                inq2_std: s => s.inquiry2.std,
                inq2_pct: s => s.inquiry2.pct,
                inq2_grade: s => s.inquiry2.grade,
                hist_raw: s => s.hist.raw,
                hist_std: s => s.hist.std,
                hist_pct: s => s.hist.pct,
                hist_grade: s => s.hist.grade,
                fl2_subject: s => s.fl2.subject,
                fl2_raw: s => s.fl2.raw,
                fl2_std: s => s.fl2.std,
                fl2_pct: s => s.fl2.pct,
                fl2_grade: s => s.fl2.grade,
            };
            const fn = MAP[key];
            if (!fn) return '';
            if (typeof fn === 'function') return fn(s) ?? '';
            return s[fn] ?? '';
        };

        // 타겟 스키마에 정의된 고정 헤더 가져오기
        const headerRows = target.exportHeaders || [];

        // 데이터 행 생성
        const dataRows = students.map(s => {
            const row = new Array(maxCol + 1).fill('');
            for (const [k, i] of Object.entries(target._idx)) {
                if (i !== null && i !== undefined) {
                    row[i] = getVal(s, k);
                }
            }
            return row;
        });

        // 전체 시트 데이터 병합 (스키마 헤더 + 실제 데이터)
        const sheetData = [...headerRows, ...dataRows];

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(sheetData);

        // 컬럼 너비 자동 조정 로직 (헤더 마지막 줄과 데이터 기준)
        const lastHeaderIndex = Math.max(0, headerRows.length - 1);
        const refRowForWidth = headerRows[lastHeaderIndex] || [];

        ws['!cols'] = Array.from({length: maxCol + 1}).map((_, ci) => ({
            wch: Math.max(
                String(refRowForWidth[ci] || '').length,
                ...dataRows.map(r => String(r[ci] || '').length),
                4 // 최소 너비
            ) + 2
        }));
        XLSX.utils.book_append_sheet(wb, ws, '성적데이터');
        const wbout = XLSX.write(wb, {bookType: 'xlsx', type: 'array'});
        dlBlob(new Blob([wbout], {type: 'application/octet-stream'}), fileName);
    }
}