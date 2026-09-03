import {colToIdx} from './utils.js';

// 영문 변수명을 한글 라벨로 변환해주는 매핑 사전
export const FIELD_LABELS = {
    exam_year: '학년도',
    student_id: '학번',
    grade_year: '학년',
    class: '반',
    number: '번호',
    name: '이름',
    kor_subject: '국어 선택과목명',
    kor_common_raw: '국어 공통원점수',
    kor_select_raw: '국어 선택원점수',
    kor_raw: '국어 원점수',
    kor_std: '국어 표준점수',
    kor_pct: '국어 백분위',
    kor_grade: '국어 등급',
    math_subject: '수학 선택과목명',
    math_common_raw: '수학 공통원점수',
    math_select_raw: '수학 선택원점수',
    math_raw: '수학 원점수',
    math_std: '수학 표준점수',
    math_pct: '수학 백분위',
    math_grade: '수학 등급',
    eng_raw: '영어 원점수',
    eng_std: '영어 표준점수',
    eng_pct: '영어 백분위',
    eng_grade: '영어 등급',
    inq_domain: '탐구영역',
    inq1_subject: '탐구1 과목명',
    inq1_raw: '탐구1 원점수',
    inq1_std: '탐구1 표준점수',
    inq1_pct: '탐구1 백분위',
    inq1_grade: '탐구1 등급',
    inq2_subject: '탐구2 과목명',
    inq2_raw: '탐구2 원점수',
    inq2_std: '탐구2 표준점수',
    inq2_pct: '탐구2 백분위',
    inq2_grade: '탐구2 등급',
    hist_raw: '한국사 원점수',
    hist_std: '한국사 표준점수',
    hist_pct: '한국사 백분위',
    hist_grade: '한국사 등급',
    fl2_subject: '제2외국어 과목명',
    fl2_raw: '제2외국어 원점수',
    fl2_std: '제2외국어 표준점수',
    fl2_pct: '제2외국어 백분위',
    fl2_grade: '제2외국어 등급'
};

/* ───────────────────────────────────────────
       § FormatSchema 클래스
    ─────────────────────────────────────────── */
export class FormatSchema {
    constructor({id, label, color, icon, headerRows, fields, exportHeaders, customGetters}) {
        this.id = id;
        this.label = label;
        this.color = color;
        this.icon = icon;
        this.headerRows = headerRows;
        this.fields = fields;
        this.exportHeaders = exportHeaders || [];
        this.customGetters = customGetters || {};

        // 숫자 필드에 대해 자동으로 ensureNumericOrZero 적용
        const numericSuffixes = ['_raw', '_std', '_pct', '_grade'];
        for (const key of Object.keys(fields)) {
            // 숫자 필드이고 customGetters에 아직 정의되지 않은 경우
            if (numericSuffixes.some(suffix => key.endsWith(suffix))) {
                if (!this.customGetters[key]) {
                    this.customGetters[key] = ensureNumericOrZero;
                }
            }
        }

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
export const SCHEMAS = {
    /**
     * 대교협 스키마
     */
    daegyohyeop: new FormatSchema({
        id: 'daegyohyeop',
        label: '대교협(실채점)',
        color: 'indigo',
        icon: 'fa-landmark',
        headerRows: 2,
        exportHeaders: [['학년도', '학년', '반', '번호', '이름', '한국사', '', '국어', '', '', '', '', '수학', '', '', '', '', '영어', '', '탐구영역1', '', '', '', '', '탐구영역2', '', '', '', '', '제2외국어', '', ''], ['', '', '', '', '', '원점수', '등급', '선택', '원점수', '표준점수', '백분위', '등급', '선택', '원점수', '표준점수', '백분위', '등급', '원점수', '등급', '선택', '원점수', '표준점수', '백분위', '등급', '선택', '원점수', '표준점수', '백분위', '등급', '과목명', '원점수', '등급']],
        fields: {
            exam_year: 'A',
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
        customGetters: {
            exam_year: (s, baseValue) => {
                if (baseValue) return baseValue;
                const now = new Date();
                return now.getFullYear() + 1;
            },
            inq1_subject: convertRomanToNumber,
            inq2_subject: convertRomanToNumber,
            fl2_subject: convertRomanToNumber,
        },
    }),

    daegyohyeop_preview: new FormatSchema({
        id: 'daegyohyeop_preview',
        label: '대교협(가채점)',
        color: 'amber',
        icon: 'fa-pencil',
        headerRows: 3,
        exportHeaders: [['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
            ['학년도', '학년', '반', '번호', '이름', '한국사', '국어', '', '', '수학', '', '', '영어', '탐구영역1', '', '탐구영역2', '', '제2외국어', ''],
            ['', '', '', '', '', '원점수', '영역', '공통\n원점수', '선택\n원점수', '영역', '공통\n원점수', '선택\n원점수',
                '원점수', '과목명', '원점수', '과목명', '원점수', '과목명', '원점수']],
        fields: {
            exam_year: 'A',
            grade_year: 'B',
            class: 'C',
            number: 'D',
            name: 'E',
            hist_raw: 'F',
            kor_subject: 'G',
            kor_common_raw: 'H',
            kor_select_raw: 'I',
            math_subject: 'J',
            math_common_raw: 'K',
            math_select_raw: 'L',
            eng_raw: 'M',
            inq1_subject: 'N',
            inq1_raw: 'O',
            inq2_subject: 'P',
            inq2_raw: 'Q',
            fl2_subject: 'R',
            fl2_raw: 'S',
        },
        customGetters: {
            exam_year: (s, baseValue) => {
                if (baseValue) return baseValue;
                const now = new Date();
                return now.getFullYear() + 1;
            },
            inq1_subject: convertRomanToNumber,
            inq2_subject: convertRomanToNumber,
            fl2_subject: convertRomanToNumber,
        },
    }),

    /**
     * 유니브 스키마
     */
    univcoop: new FormatSchema({
        id: 'univcoop',
        label: '유니브',
        color: 'blue',
        icon: 'fa-building-columns',
        headerRows: 2,
        exportHeaders: [['계열번호', '학년', '반', '번호', '이름', '국어', '', '', '', '', '', '', '수학', '', '', '', '', '', '', '영어', '', '', '', '탐구영역', '선택1', '', '', '', '', '선택2', '', '', '', '', '한국사', '', '', '', '제2외국어', '', '', '', ''], ['', '', '', '', '', '국어선택', '공통원점수', '선택원점수', '원점수총점', '표준점수', '백분위', '등급', '수학선택', '공통원점수', '선택원점수', '원점수총점', '표준점수', '백분위', '등급', '원점수', '표준점수', '백분위', '등급', '', '과목명', '원점수', '표준점수', '백분위', '등급', '과목명', '원점수', '표준점수', '백분위', '등급', '원점수', '표준점수', '백분위', '등급', '과목명', '원점수', '표준점수', '백분위', '등급']],
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
        customGetters: {
            inq1_subject: convertRomanToNumber,
            inq2_subject: convertRomanToNumber,
            fl2_subject: convertRomanToNumber,
        },
    }),

    /**
     * 김영일 스키마
     */
    kimyoungil: new FormatSchema({
        id: 'kimyoungil',
        label: '김영일',
        color: 'violet',
        icon: 'fa-book',
        headerRows: 1,
        exportHeaders: [['아이디', '이름', '학년', '시험일자', '출제기관', '한국사(원점수)', '한국사(등급)', '국어선택과목', '국어(공통)', '국어(선택)', '국어(원점수)', '국어(표준점수)', '국어(백분위)', '국어(등급)', '수학선택과목', '수학(공통)', '수학(선택)', '수학(원점수)', '수학(표준점수)', '수학(백분위)', '수학(등급)', '영어(원점수)', '영어(등급)', '탐1과목명', '탐1(원점수)', '탐1(표준점수)', '탐1(백분위)', '탐1(등급)', '탐2과목명', '탐2(원점수)', '탐2(표준점수)', '탐2(백분위)', '탐2(등급)', '제2외국어과목명', '제2외(원점수)', '제2외(등급)', '잠금상태']],
        fields: {
            student_id: 'A',
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
        customGetters: {
            student_id: (s, baseValue) => {
                if (baseValue) return baseValue;

                const toSafeInt = (v, fallback = 0) => {
                    const n = Number(v);
                    return Number.isInteger(n) && n >= 0 ? n : fallback;
                };

                const grade = String(toSafeInt(s.grade_year));
                const klass = String(toSafeInt(s.class)).padStart(2, '0');
                const number = String(toSafeInt(s.number)).padStart(3, '0');

                return grade + klass + number;
            },
            // 김영일은 과목명에 공백을 허용하지 않으므로 공백 일괄 제거
            kor_subject: removeSpaces,
            math_subject: removeSpaces,
            inq1_subject: removeSpaces,
            inq2_subject: removeSpaces,
            fl2_subject: removeSpaces,
        }
    }),

    /**
     * 전문대 스키마
     */
    kkumkugo: new FormatSchema({
        id: 'kkumkugo',
        label: '꿈꾸GO',
        color: 'emerald',
        icon: 'fa-star',
        headerRows: 2,
        exportHeaders: [['학년', '반', '번호', '이름', '국어영역', '', '', '', '', '수학영역', '', '', '', '', '영어영역', '', '한국사', '', '탐구영역', '탐구선택1', '', '', '', '', '탐구선택2', '', '', '', '', '제2외국어/한문', '', ''], ['', '', '', '', '국어선택', '원점수', '표준점수', '백분위', '등급', '수학선택', '원점수', '표준점수', '백분위', '등급', '원점수', '등급', '원점수', '등급', '', '과목명', '원점수', '표준점수', '백분위', '등급', '과목명', '원점수', '표준점수', '백분위', '등급', '과목명', '원점수', '등급']],
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

                // 1. 직업탐구 우선 검사
                const vocKeywords = ['성공적인직업생활', '농업기초기술', '공업일반', '상업경제', '수산·해운산업기초', '인간발달'];
                const isVoc1 = vocKeywords.some(kw => sub1.includes(kw));
                const isVoc2 = vocKeywords.some(kw => sub2.includes(kw));

                // 직업탐구 과목이 하나라도 포함되어 있으면 직업탐구로 분류
                if (isVoc1 || isVoc2) {
                    return '직업탐구';
                }

                // 2. 직업탐구가 아닐 경우(else) 과학탐구, 사회탐구 판별
                const sciKeywords = ['물리', '화학', '생명', '지구'];
                const isSci1 = sciKeywords.some(kw => sub1.includes(kw));
                const isSci2 = sciKeywords.some(kw => sub2.includes(kw));

                if (isSci1 && isSci2) return '과학탐구';
                if (isSci1 || isSci2) return '사회과학탐구';

                return '사회탐구';
            },
            // 케이스 B: 일반 로직이 만들어준 값을 살짝 가공만 하는 경우 (강력함!)
            inq1_subject: convertNumberToRoman,
            inq2_subject: convertNumberToRoman,
            fl2_subject: convertNumberToRoman,
        },
    })
};

// 숫자를 로마자로 변환 (1 -> Ⅰ)
// (\D)로 앞 글자가 숫자가 아닌 경우만 치환 — "탐구11" → "탐구11" 유지, "물리학1" → "물리학Ⅰ"
export function convertNumberToRoman(s, baseValue) {
    if (!baseValue) return '';
    let val = baseValue.replace(/\s+/g, '');
    return val.replace(/(\D)1$/, '$1Ⅰ').replace(/(\D)2$/, '$1Ⅱ');
}

// 로마자를 숫자로 변환 (Ⅰ -> 1)
export function convertRomanToNumber(s, baseValue) {
    if (!baseValue) return '';
    let val = baseValue.replace(/\s+/g, '');
    return val.replace(/Ⅰ$/, '1').replace(/Ⅱ$/, '2');
}

// 공백 삭제
export function removeSpaces(s, baseValue) {
    if (!baseValue) return '';
    return baseValue.replace(/\s+/g, '');
}

// 숫자 점수 데이터를 export할 때 null/빈 값은 빈 문자열로, 실제 숫자는 숫자로 변환
// 0 → 0, '0' → 0, null/undefined/'' → '' (빈 셀)
// 이 함수를 0으로 반환하면 교차 포맷 변환 시 null 점수가 0으로 왜곡됨
export function ensureNumericOrZero(s, baseValue) {
    if (baseValue === null || baseValue === undefined || baseValue === '') return '';
    const n = parseFloat(baseValue);
    return isNaN(n) ? '' : n;
}