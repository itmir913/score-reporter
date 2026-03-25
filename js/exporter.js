/* ───────────────────────────────────────────
   § GradeExporter 클래스
─────────────────────────────────────────── */
class GradeExporter {
    static toXlsx(students, target, fileName) {
        const maxCol = Math.max(...Object.values(target._idx).filter(i => i !== null));
        const getVal = (s, key) => {
            const MAP = {
                grade_year: 'grade_year', class: 'class', number: 'number', name: 'name',
                kor_subject: s => s.korean.subject, kor_common_raw: s => s.korean.common_raw, kor_select_raw: s => s.korean.select_raw, kor_raw: s => s.korean.raw, kor_std: s => s.korean.std, kor_pct: s => s.korean.pct, kor_grade: s => s.korean.grade,
                math_subject: s => s.math.subject, math_common_raw: s => s.math.common_raw, math_select_raw: s => s.math.select_raw, math_raw: s => s.math.raw, math_std: s => s.math.std, math_pct: s => s.math.pct, math_grade: s => s.math.grade,
                eng_raw: s => s.english.raw, eng_std: s => s.english.std, eng_pct: s => s.english.pct, eng_grade: s => s.english.grade,
                inq1_subject: s => s.inquiry1.subject, inq1_raw: s => s.inquiry1.raw, inq1_std: s => s.inquiry1.std, inq1_pct: s => s.inquiry1.pct, inq1_grade: s => s.inquiry1.grade,
                inq2_subject: s => s.inquiry2.subject, inq2_raw: s => s.inquiry2.raw, inq2_std: s => s.inquiry2.std, inq2_pct: s => s.inquiry2.pct, inq2_grade: s => s.inquiry2.grade,
                hist_raw: s => s.hist.raw, hist_std: s => s.hist.std, hist_pct: s => s.hist.pct, hist_grade: s => s.hist.grade,
                fl2_subject: s => s.fl2.subject, fl2_raw: s => s.fl2.raw, fl2_std: s => s.fl2.std, fl2_pct: s => s.fl2.pct, fl2_grade: s => s.fl2.grade,
            };
            const fn = MAP[key];
            if (!fn) return '';
            if (typeof fn === 'function') return fn(s) ?? '';
            return s[fn] ?? '';
        };

        const LABELS = {
            grade_year: '학년', class: '반', number: '번호', name: '이름',
            kor_subject: '국어_선택과목명', kor_raw: '국어_원점수', kor_std: '국어_표준점수', kor_pct: '국어_백분위', kor_grade: '국어_등급',
            math_subject: '수학_선택과목명', math_raw: '수학_원점수', math_std: '수학_표준점수', math_pct: '수학_백분위', math_grade: '수학_등급',
            eng_raw: '영어_원점수', eng_grade: '영어_등급',
            inq1_subject: '탐구1_과목명', inq1_raw: '탐구1_원점수', inq1_std: '탐구1_표준점수', inq1_pct: '탐구1_백분위', inq1_grade: '탐구1_등급',
            inq2_subject: '탐구2_과목명', inq2_raw: '탐구2_원점수', inq2_std: '탐구2_표준점수', inq2_pct: '탐구2_백분위', inq2_grade: '탐구2_등급',
            hist_raw: '한국사_원점수', hist_grade: '한국사_등급',
            fl2_subject: '제2외국어_과목명', fl2_raw: '제2외국어_원점수', fl2_grade: '제2외국어_등급',
        };

        const hdr = new Array(maxCol + 1).fill('');
        for (const [k, i] of Object.entries(target._idx)) {
            if (i !== null && i !== undefined) hdr[i] = LABELS[k] || k;
        }

        const dataRows = students.map(s => {
            const row = new Array(maxCol + 1).fill('');
            for (const [k, i] of Object.entries(target._idx)) {
                if (i !== null && i !== undefined) row[i] = getVal(s, k);
            }
            return row;
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([hdr, ...dataRows]);
        ws['!cols'] = hdr.map((h, ci) => ({
            wch: Math.max(String(h || '').length, ...dataRows.map(r => String(r[ci] || '').length), 4) + 2,
        }));
        XLSX.utils.book_append_sheet(wb, ws, '성적데이터');
        const wbout = XLSX.write(wb, {bookType: 'xlsx', type: 'array'});
        dlBlob(new Blob([wbout], {type: 'application/octet-stream'}), fileName);
    }
}
