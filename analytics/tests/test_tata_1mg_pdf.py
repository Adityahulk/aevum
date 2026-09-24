from ingestion import tata_1mg_rows, normalized_row


class Page:
    def __init__(self, text):
        self.text = text

    def extract_text(self):
        return self.text


class Reader:
    def __init__(self, pages):
        self.pages = [Page(page) for page in pages]


def test_tata_1mg_result_table_preserves_units_and_original_date():
    reader = Reader([
        "cover",
        "Collection Date : 06/Aug/2026 Hemoglobin 13.3 g/dL 12.0 - 15.0 "
        "RBC 4.53 mili/cu.mm 3.8 - 4.8 Total Leucocyte Count 7.46 10^3/µL 4 - 10 "
        "Direct LDL 113.00 mg/dL <= 99.9 High sensitivity CRP 5.24 mg/L 0 - 3",
        "", "", "", "", "",
        "MCV 87.8 fL 83 - 101 MCH 29.5 pg 27 - 32 MPV 9.8 f L 6.5 - 12",
    ])
    rows = tata_1mg_rows(reader)
    by_code = {row["concept_id"]: row for row in rows}
    assert by_code["RBC"]["unit"] == "mili/cu.mm"
    assert by_code["LDL"]["value"] == "113.00"
    assert by_code["MCV"]["date"] == "2026-08-06"
    assert normalized_row(by_code["MPV"], "lab_pdf", "source")["unit"] == "fL"
