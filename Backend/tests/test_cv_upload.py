"""PDF / DOCX / text CV extraction."""

from io import BytesIO

from docx import Document
from fastapi.testclient import TestClient

from app.core.errors import ApiError
from app.services.cv_extract import extract_cv_text

CANDIDATE = {"X-Development-Identity": "cv-file-candidate"}

SAMPLE = (
    "Jane Doe\nSenior Backend Engineer\n\n"
    "Summary\nAPI design and system design specialist with strong testing habits.\n\n"
    "Skills\nAPI design, system design, testing, observability, Python, FastAPI\n\n"
    "Experience\nBuilt hiring platforms with FastAPI and Postgres.\n"
)


def _docx_bytes(text: str) -> bytes:
    document = Document()
    for line in text.splitlines():
        document.add_paragraph(line)
    buffer = BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def _pdf_bytes(text: str) -> bytes:
    # Minimal PDF with a text content stream (Helvetica).
    # Keep the content short enough for a simple hand-built object.
    safe = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    # Split into a few Tj lines so extractors see enough characters.
    lines = [safe[i : i + 60] for i in range(0, min(len(safe), 300), 60)]
    content_ops = ["BT", "/F1 12 Tf", "50 750 Td"]
    for index, line in enumerate(lines):
        if index:
            content_ops.append("0 -16 Td")
        content_ops.append(f"({line}) Tj")
    content_ops.append("ET")
    stream = "\n".join(content_ops).encode("latin-1", errors="replace")
    objects = [
        b"1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
        b"2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n",
        (
            b"3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n"
        ),
        (
            f"4 0 obj<< /Length {len(stream)} >>stream\n".encode()
            + stream
            + b"\nendstream\nendobj\n"
        ),
        b"5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objects:
        offsets.append(len(out))
        out.extend(obj)
    xref_pos = len(out)
    out.extend(f"xref\n0 {len(offsets)}\n".encode())
    out.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        out.extend(f"{offset:010d} 00000 n \n".encode())
    out.extend(
        f"trailer<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode()
    )
    return bytes(out)


def test_extract_docx() -> None:
    text, fmt = extract_cv_text(data=_docx_bytes(SAMPLE), filename="resume.docx")
    assert fmt == "docx"
    assert "API design" in text
    assert len(text) >= 40


def test_extract_pdf() -> None:
    text, fmt = extract_cv_text(data=_pdf_bytes(SAMPLE), filename="resume.pdf")
    assert fmt == "pdf"
    assert "Jane" in text or "API" in text
    assert len(text) >= 40


def test_extract_rejects_legacy_doc() -> None:
    try:
        extract_cv_text(data=b"legacy", filename="resume.doc")
        raise AssertionError("expected ApiError")
    except ApiError as error:
        assert error.code == "cv_format_unsupported"


def test_upload_docx_endpoint(client: TestClient) -> None:
    response = client.post(
        "/api/v1/candidates/me/cv/upload",
        headers=CANDIDATE,
        files={
            "file": (
                "resume.docx",
                _docx_bytes(SAMPLE),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"apply_to_profile": "true"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["source_format"] == "docx"
    assert body["candidate"]["has_embedding"] is True
    assert body["parsed_cv"]["sections"]
