// 영문 변수명을 한글 라벨로 변환해주는 매핑 사전
const FIELD_LABELS = {
    grade_year: '학년',
    class: '반',
    number: '번호',
    name: '이름',
    kor_subject: '국어_선택과목명',
    kor_common_raw: '국어_공통원점수',
    kor_select_raw: '국어_선택원점수',
    kor_raw: '국어_원점수',
    kor_std: '국어_표준점수',
    kor_pct: '국어_백분위',
    kor_grade: '국어_등급',
    math_subject: '수학_선택과목명',
    math_common_raw: '수학_공통원점수',
    math_select_raw: '수학_선택원점수',
    math_raw: '수학_원점수',
    math_std: '수학_표준점수',
    math_pct: '수학_백분위',
    math_grade: '수학_등급',
    eng_raw: '영어_원점수',
    eng_std: '영어_표준점수',
    eng_pct: '영어_백분위',
    eng_grade: '영어_등급',
    inq_domain: '탐구영역',
    inq1_subject: '탐구1_과목명',
    inq1_raw: '탐구1_원점수',
    inq1_std: '탐구1_표준점수',
    inq1_pct: '탐구1_백분위',
    inq1_grade: '탐구1_등급',
    inq2_subject: '탐구2_과목명',
    inq2_raw: '탐구2_원점수',
    inq2_std: '탐구2_표준점수',
    inq2_pct: '탐구2_백분위',
    inq2_grade: '탐구2_등급',
    hist_raw: '한국사_원점수',
    hist_std: '한국사_표준점수',
    hist_pct: '한국사_백분위',
    hist_grade: '한국사_등급',
    fl2_subject: '제2외국어_과목명',
    fl2_raw: '제2외국어_원점수',
    fl2_std: '제2외국어_표준점수',
    fl2_pct: '제2외국어_백분위',
    fl2_grade: '제2외국어_등급'
};

/* ───────────────────────────────────────────
       § FormatSchema 클래스
    ─────────────────────────────────────────── */
class FormatSchema {
    constructor({id, label, color, icon, headerRows, fields, exportHeaders, customGetters}) {
        this.id = id;
        this.label = label;
        this.color = color;
        this.icon = icon;
        this.headerRows = headerRows;
        this.fields = fields;
        this.exportHeaders = exportHeaders || [];
        this.customGetters = customGetters || {};

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
        exportHeaders: [
            ['학년도', '학년', '반', '번호', '이름', '한국사', '', '국어', '', '', '', '', '수학', '', '', '', '', '영어', '', '탐구영역1', '', '', '', '', '탐구영역2', '', '', '', '', '제2외국어', '', ''],
            ['', '', '', '', '', '원점수', '등급', '선택', '원점수', '표준점수', '백분위', '등급', '선택', '원점수', '표준점수', '백분위', '등급', '원점수', '등급', '선택', '원점수', '표준점수', '백분위', '등급', '선택', '원점수', '표준점수', '백분위', '등급', '과목명', '원점수', '등급']
        ],
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
        exportHeaders: [
            ['계열번호', '학년', '반', '번호', '이름', '국어', '', '', '', '', '', '', '수학', '', '', '', '', '', '', '영어', '', '', '', '탐구영역', '선택1', '', '', '', '', '선택2', '', '', '', '', '한국사', '', '', '', '제2외국어', '', '', '', ''],
            ['', '', '', '', '', '국어선택', '공통원점수', '선택원점수', '원점수총점', '표준점수', '백분위', '등급', '수학선택', '공통원점수', '선택원점수', '원점수총점', '표준점수', '백분위', '등급', '원점수', '표준점수', '백분위', '등급', '', '과목명', '원점수', '표준점수', '백분위', '등급', '과목명', '원점수', '표준점수', '백분위', '등급', '원점수', '표준점수', '백분위', '등급', '과목명', '원점수', '표준점수', '백분위', '등급']
        ],
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
        exportHeaders: [
            ['아이디', '이름', '학년', '시험일자', '출제기관', '한국사(원점수)', '한국사(등급)', '국어선택과목', '국어(공통)', '국어(선택)', '국어(원점수)', '국어(표준점수)', '국어(백분위)', '국어(등급)', '수학선택과목', '수학(공통)', '수학(선택)', '수학(원점수)', '수학(표준점수)', '수학(백분위)', '수학(등급)', '영어(원점수)', '영어(등급)', '탐1과목명', '탐1(원점수)', '탐1(표준점수)', '탐1(백분위)', '탐1(등급)', '탐2과목명', '탐2(원점수)', '탐2(표준점수)', '탐2(백분위)', '탐2(등급)', '제2외국어과목명', '제2외(원점수)', '제2외(등급)', '잠금상태']
        ],
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
        exportHeaders: [
            ['학년', '반', '번호', '이름', '국어영역', '', '', '', '', '수학영역', '', '', '', '', '영어영역', '', '한국사', '', '탐구영역', '탐구선택1', '', '', '', '', '탐구선택2', '', '', '', '', '제2외국어/한문', '', ''],
            ['', '', '', '', '국어선택', '원점수', '표준점수', '백분위', '등급', '수학선택', '원점수', '표준점수', '백분위', '등급', '원점수', '등급', '원점수', '등급', '', '과목명', '원점수', '표준점수', '백분위', '등급', '과목명', '원점수', '표준점수', '백분위', '등급', '과목명', '원점수', '등급']
        ],
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
            inq_domain: 'S',
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
        customGetters: {
            // 케이스 A: 아예 새로운 파생 데이터를 만들어야 하는 경우 (inq_domain)
            inq_domain: (s, baseValue) => {
                const sub1 = s.inquiry1?.subject || '';
                const sub2 = s.inquiry2?.subject || '';
                if (!sub1 && !sub2) return '';

                const sciKeywords = ['물리', '화학', '생명', '지구'];
                const isSci1 = sciKeywords.some(kw => sub1.includes(kw));
                const isSci2 = sciKeywords.some(kw => sub2.includes(kw));

                if (isSci1 && isSci2) return '과학탐구';
                if (isSci1 || isSci2) return '사회과학탐구';
                return '사회탐구';
            },
            // 케이스 B: 일반 로직이 만들어준 값을 살짝 가공만 하는 경우 (강력함!)
            // math_grade: (s, baseValue) => {
            //     // 일반 로직이 이미 수학 등급(baseValue)을 구해왔으므로, 복잡한 계산 없이 조건문만 추가!
            //     if (parseInt(baseValue) >= 5) {
            //         return `${baseValue}등급 (주의)`;
            //     }
            //     return baseValue;
            // }
        },
    })
};
