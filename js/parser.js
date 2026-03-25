/* ───────────────────────────────────────────
   § GradeDataParser 클래스
─────────────────────────────────────────── */
class GradeDataParser {
    constructor(schema) {
        this.s = schema;
    }

    parse(wb, sheet) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], {header: 1, defval: ''}).slice(this.s.headerRows);
        return rows.filter(row => this.s.str(row, 'name')).map(row => this._row(row));
    }

    _row(r) {
        const s = this.s;
        return {
            grade_year: s.str(r, 'grade_year'), class: s.str(r, 'class'), number: s.str(r, 'number'), name: s.str(r, 'name'),
            korean: {
                subject: s.str(r, 'kor_subject'), common_raw: s.num(r, 'kor_common_raw'), select_raw: s.num(r, 'kor_select_raw'),
                raw: s.num(r, 'kor_raw'), std: s.num(r, 'kor_std'), pct: s.num(r, 'kor_pct'), grade: s.num(r, 'kor_grade'),
            },
            math: {
                subject: s.str(r, 'math_subject'), common_raw: s.num(r, 'math_common_raw'), select_raw: s.num(r, 'math_select_raw'),
                raw: s.num(r, 'math_raw'), std: s.num(r, 'math_std'), pct: s.num(r, 'math_pct'), grade: s.num(r, 'math_grade'),
            },
            english: { raw: s.num(r, 'eng_raw'), std: s.num(r, 'eng_std'), pct: s.num(r, 'eng_pct'), grade: s.num(r, 'eng_grade') },
            inquiry1: { subject: s.str(r, 'inq1_subject'), raw: s.num(r, 'inq1_raw'), std: s.num(r, 'inq1_std'), pct: s.num(r, 'inq1_pct'), grade: s.num(r, 'inq1_grade') },
            inquiry2: { subject: s.str(r, 'inq2_subject'), raw: s.num(r, 'inq2_raw'), std: s.num(r, 'inq2_std'), pct: s.num(r, 'inq2_pct'), grade: s.num(r, 'inq2_grade') },
            hist: { raw: s.num(r, 'hist_raw'), std: s.num(r, 'hist_std'), pct: s.num(r, 'hist_pct'), grade: s.num(r, 'hist_grade') },
            fl2: { subject: s.str(r, 'fl2_subject'), raw: s.num(r, 'fl2_raw'), std: s.num(r, 'fl2_std'), pct: s.num(r, 'fl2_pct'), grade: s.num(r, 'fl2_grade') }
        };
    }
}
