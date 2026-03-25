/* ───────────────────────────────────────────
       § FormatSchema 클래스
    ─────────────────────────────────────────── */
class FormatSchema {
    constructor({id, label, color, icon, headerRows, fields}) {
        this.id = id;
        this.label = label;
        this.color = color;
        this.icon = icon;
        this.headerRows = headerRows;
        this.fields = fields;

        this._idx = {};
        for (const [k, col] of Object.entries(fields)) {
            this._idx[k] = colToIdx(col);
        }
    }

    supports(key) {
        return this._idx[key] !== null && this._idx[key] !== undefined;
    }

    _raw(row, key) {
        const i = this._idx[key];
        if (i === null || i === undefined) return null;
        const v = row[i];
        return (v !== undefined && v !== null && v !== '') ? v : null;
    }

    str(row, key) {
        const v = this._raw(row, key);
        return v !== null ? String(v).trim() : '';
    }

    num(row, key) {
        const v = this._raw(row, key);
        if (v === null) return null;
        const n = parseFloat(v);
        return isNaN(n) ? null : n;
    }

    supportedKeys() {
        return Object.keys(this._idx).filter(k => this.supports(k));
    }
}

/* ───────────────────────────────────────────
   § 양식 스키마 정의
─────────────────────────────────────────── */
const SCHEMAS = {
    /**
     * 대교협 스키마
     */
    daegyohyeop: new FormatSchema({
        id: 'daegyohyeop', label: '대교협', color: 'indigo', icon: 'fa-landmark',
        headerRows: 2,
        fields: {
            grade_year: 'B',
            class: 'C',
            number: 'D',
            name: 'E',
            hist_grade: 'G',
            hist_raw: 'F',
            kor_subject: 'H',
            kor_common_raw: '',
            kor_select_raw: '',
            kor_raw: 'I',
            kor_std: 'J',
            kor_pct: 'K',
            kor_grade: 'L',
            math_subject: 'M',
            math_common_raw: '',
            math_select_raw: '',
            math_raw: 'N',
            math_std: 'O',
            math_pct: 'P',
            math_grade: 'Q',
            eng_raw: 'R',
            eng_std: '',
            eng_pct: '',
            eng_grade: 'S',
            inq1_subject: 'T',
            inq1_raw: 'U',
            inq1_std: 'V',
            inq1_pct: 'W',
            inq1_grade: 'X',
            inq2_subject: 'Y',
            inq2_raw: 'Z',
            inq2_std: 'AA',
            inq2_pct: 'AB',
            inq2_grade: 'AC',
            hist_std: '',
            hist_pct: '',
            fl2_subject: 'AD',
            fl2_raw: 'AE',
            fl2_std: '',
            fl2_pct: '',
            fl2_grade: 'AF',
        },
    }),

    /**
     * 유니브 스키마
     */
    univcoop: new FormatSchema({
        id: 'univcoop', label: '유니브', color: 'blue', icon: 'fa-building-columns',
        headerRows: 2,
        fields: {
            grade_year: 'B',
            class: 'C',
            number: 'D',
            name: 'E',
            kor_subject: 'F',
            kor_common_raw: 'G',
            kor_select_raw: 'H',
            kor_raw: 'I',
            kor_std: 'J',
            kor_pct: 'K',
            kor_grade: 'L',
            math_subject: 'M',
            math_common_raw: 'N',
            math_select_raw: 'O',
            math_raw: 'P',
            math_std: 'Q',
            math_pct: 'R',
            math_grade: 'S',
            eng_raw: 'T',
            eng_std: 'U',
            eng_pct: 'V',
            eng_grade: 'W',
            inq1_subject: 'Y',
            inq1_raw: 'Z',
            inq1_std: 'AA',
            inq1_pct: 'AB',
            inq1_grade: 'AC',
            inq2_subject: 'AD',
            inq2_raw: 'AE',
            inq2_std: 'AF',
            inq2_pct: 'AG',
            inq2_grade: 'AH',
            hist_raw: 'AI',
            hist_std: 'AJ',
            hist_pct: 'AK',
            hist_grade: 'AL',
            fl2_subject: 'AM',
            fl2_raw: 'AN',
            fl2_std: 'AO',
            fl2_pct: 'AP',
            fl2_grade: 'AQ',
        },
    }),

    /**
     * 김영일 스키마
     */
    kimyoungil: new FormatSchema({
        id: 'kimyoungil', label: '김영일', color: 'violet', icon: 'fa-book',
        headerRows: 1,
        fields: {
            grade_year: 'C',
            class: '',
            number: '',
            name: 'B',
            hist_raw: 'F',
            hist_grade: 'G',
            kor_subject: 'H',
            kor_common_raw: 'I',
            kor_select_raw: 'J',
            kor_raw: 'K',
            kor_std: 'L',
            kor_pct: 'M',
            kor_grade: 'N',
            math_subject: 'O',
            math_common_raw: 'P',
            math_select_raw: 'Q',
            math_raw: 'R',
            math_std: 'S',
            math_pct: 'T',
            math_grade: 'U',
            eng_raw: 'V',
            eng_std: '',
            eng_pct: '',
            eng_grade: 'W',
            inq1_subject: 'X',
            inq1_raw: 'Y',
            inq1_std: 'Z',
            inq1_pct: 'AA',
            inq1_grade: 'AB',
            inq2_subject: 'AC',
            inq2_raw: 'AD',
            inq2_std: 'AE',
            inq2_pct: 'AF',
            inq2_grade: 'AG',
            hist_std: '',
            hist_pct: '',
            fl2_subject: 'AH',
            fl2_raw: 'AI',
            fl2_std: '',
            fl2_pct: '',
            fl2_grade: 'AJ',
        },
    }),

    /**
     * 전문대 스키마
     */
    kkumkugo: new FormatSchema({
        id: 'kkumkugo', label: '꿈꾸GO', color: 'emerald', icon: 'fa-star',
        headerRows: 2,
        fields: {
            grade_year: 'A',
            class: 'B',
            number: 'C',
            name: 'D',
            kor_subject: 'E',
            kor_common_raw: '',
            kor_select_raw: '',
            kor_raw: 'F',
            kor_std: 'G',
            kor_pct: 'H',
            kor_grade: 'I',
            math_subject: 'J',
            math_common_raw: '',
            math_select_raw: '',
            math_raw: 'K',
            math_std: 'L',
            math_pct: 'M',
            math_grade: 'N',
            eng_raw: 'O',
            eng_std: '',
            eng_pct: '',
            eng_grade: 'P',
            hist_raw: 'Q',
            hist_grade: 'R',
            hist_std: '',
            hist_pct: '',
            inq1_subject: 'T',
            inq1_raw: 'U',
            inq1_std: 'V',
            inq1_pct: 'W',
            inq1_grade: 'X',
            inq2_subject: 'Y',
            inq2_raw: 'Z',
            inq2_std: 'AA',
            inq2_pct: 'AB',
            inq2_grade: 'AC',
            fl2_subject: 'AD',
            fl2_raw: 'AE',
            fl2_std: '',
            fl2_pct: '',
            fl2_grade: 'AF',
        },
    })
};
