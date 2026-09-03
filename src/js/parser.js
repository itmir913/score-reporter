import {exceljsTo2DArray} from './main.js';

/* ───────────────────────────────────────────
   § GradeDataParser 클래스
─────────────────────────────────────────── */
export class GradeDataParser {
    constructor(schema) {
        this.s = schema;
    }

    parse(wb, sheetName) {
        // ExcelJS에서 시트를 가져온 후 main.js에 선언해둔 exceljsTo2DArray를 통해 변환
        const ws = wb.getWorksheet(sheetName);
        const rows = exceljsTo2DArray(ws).slice(this.s.headerRows);

        return rows.filter(row => this.s.str(row, 'name')).map(row => this._row(row));
    }

    _row(r) {
        const s = this.s;
        const sumParts = (a, b) => (a !== null || b !== null) ? (a ?? 0) + (b ?? 0) : null;

        const korCommon = s.num(r, 'kor_common_raw');
        const korSelect = s.num(r, 'kor_select_raw');
        const mathCommon = s.num(r, 'math_common_raw');
        const mathSelect = s.num(r, 'math_select_raw');

        return {
            exam_year: s.str(r, 'exam_year'),
            grade_year: s.str(r, 'grade_year'),
            class: s.str(r, 'class'),
            number: s.str(r, 'number'),
            name: s.str(r, 'name'),
            korean: {
                subject: s.str(r, 'kor_subject'),
                common_raw: korCommon,
                select_raw: korSelect,
                raw: s.num(r, 'kor_raw') ?? sumParts(korCommon, korSelect),
                std: s.num(r, 'kor_std'),
                pct: s.num(r, 'kor_pct'),
                grade: s.num(r, 'kor_grade'),
            },
            math: {
                subject: s.str(r, 'math_subject'),
                common_raw: mathCommon,
                select_raw: mathSelect,
                raw: s.num(r, 'math_raw') ?? sumParts(mathCommon, mathSelect),
                std: s.num(r, 'math_std'),
                pct: s.num(r, 'math_pct'),
                grade: s.num(r, 'math_grade'),
            },
            english: {
                raw: s.num(r, 'eng_raw'),
                std: s.num(r, 'eng_std'),
                pct: s.num(r, 'eng_pct'),
                grade: s.num(r, 'eng_grade')
            },
            inquiry1: {
                subject: s.str(r, 'inq1_subject'),
                raw: s.num(r, 'inq1_raw'),
                std: s.num(r, 'inq1_std'),
                pct: s.num(r, 'inq1_pct'),
                grade: s.num(r, 'inq1_grade')
            },
            inquiry2: {
                subject: s.str(r, 'inq2_subject'),
                raw: s.num(r, 'inq2_raw'),
                std: s.num(r, 'inq2_std'),
                pct: s.num(r, 'inq2_pct'),
                grade: s.num(r, 'inq2_grade')
            },
            hist: {
                raw: s.num(r, 'hist_raw'),
                std: s.num(r, 'hist_std'),
                pct: s.num(r, 'hist_pct'),
                grade: s.num(r, 'hist_grade')
            },
            fl2: {
                subject: s.str(r, 'fl2_subject'),
                raw: s.num(r, 'fl2_raw'),
                std: s.num(r, 'fl2_std'),
                pct: s.num(r, 'fl2_pct'),
                grade: s.num(r, 'fl2_grade')
            }
        };
    }
}