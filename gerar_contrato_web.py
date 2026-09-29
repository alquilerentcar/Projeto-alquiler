"""Preenche o modelo Word com um JSON recebido pela entrada padrão."""
from __future__ import annotations

import io
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from xml.sax.saxutils import escape


UNITS = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"]
TEENS = {10:"dez",11:"onze",12:"doze",13:"treze",14:"quatorze",15:"quinze",16:"dezesseis",17:"dezessete",18:"dezoito",19:"dezenove"}
TENS = {20:"vinte",30:"trinta",40:"quarenta",50:"cinquenta",60:"sessenta",70:"setenta",80:"oitenta",90:"noventa"}
HUNDREDS = {100:"cem",200:"duzentos",300:"trezentos",400:"quatrocentos",500:"quinhentos",600:"seiscentos",700:"setecentos",800:"oitocentos",900:"novecentos"}


def integer_words(number: int) -> str:
    if number < 10:
        return UNITS[number]
    if number < 20:
        return TEENS[number]
    if number < 100:
        rest = number % 10
        return TENS[number - rest] + (" e " + integer_words(rest) if rest else "")
    if number < 1000:
        if number == 100:
            return "cem"
        hundreds = (number // 100) * 100
        rest = number % 100
        head = "cento" if hundreds == 100 else HUNDREDS[hundreds]
        return head + (" e " + integer_words(rest) if rest else "")
    if number < 1_000_000:
        thousands, rest = divmod(number, 1000)
        head = "mil" if thousands == 1 else integer_words(thousands) + " mil"
        return head + ((" e " if rest < 100 else " ") + integer_words(rest) if rest else "")
    return str(number)


def money_words(value) -> str:
    try:
        text = str(value).strip()
        normalized = text.replace(".", "").replace(",", ".") if "," in text else text
        cents_total = round(float(normalized) * 100)
    except (TypeError, ValueError):
        return ""
    reais, cents = divmod(cents_total, 100)
    result = integer_words(reais) + (" real" if reais == 1 else " reais")
    if cents:
        result += " e " + integer_words(cents) + (" centavo" if cents == 1 else " centavos")
    return result


def clean(value) -> str:
    return "" if value is None else str(value).strip()


def replacement(value) -> str:
    return escape(clean(value)).replace("\n", "</w:t><w:br/><w:t>")


def render(template: Path, data: dict) -> bytes:
    if not data.get("valor_diaria_extenso"):
        data["valor_diaria_extenso"] = money_words(data.get("valor_diaria"))
    if not data.get("valor_caucao_extenso"):
        data["valor_caucao_extenso"] = money_words(data.get("valor_caucao"))
    if not data.get("valor_parcela_caucao_extenso"):
        data["valor_parcela_caucao_extenso"] = money_words(data.get("valor_parcela_caucao"))
    if not data.get("prazo_dias_extenso") and clean(data.get("prazo_dias")).isdigit():
        data["prazo_dias_extenso"] = integer_words(int(data["prazo_dias"]))
    source = io.BytesIO(template.read_bytes())
    output = io.BytesIO()
    pattern = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")
    with zipfile.ZipFile(source) as zin, zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            content = zin.read(item.filename)
            if item.filename.endswith(".xml"):
                text = content.decode("utf-8")
                text = text.replace("R${{ multa_atraso_diaria }}", "{{ multa_atraso_diaria }}")
                text = text.replace("ASSINATURA DO LOCADOR", "ASSINATURA DO LOCADOR</w:t><w:br/><w:t>ALQUILER RENT A CAR LTDA")
                text = text.replace("ASSINATURA DO LOCATÁRIO", "ASSINATURA DO LOCATÁRIO</w:t><w:br/><w:t>{{ nome_locatario }}")
                text = pattern.sub(lambda match: replacement(data.get(match.group(1), "")), text)
                content = text.encode("utf-8")
            zout.writestr(item, content)
    return output.getvalue()


def paragraphs(document: bytes) -> list[str]:
    """Extrai o texto do Word preenchido para a prévia no navegador."""
    namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    with zipfile.ZipFile(io.BytesIO(document)) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    result = []
    for paragraph in root.iter(namespace + "p"):
        parts = []
        for node in paragraph.iter():
            if node.tag == namespace + "t" and node.text:
                parts.append(node.text)
            elif node.tag == namespace + "tab":
                parts.append("\t")
            elif node.tag == namespace + "br":
                parts.append("\n")
        text = "".join(parts).strip()
        if text:
            result.append(text)
    return result


def main() -> int:
    template = Path(__file__).with_name("modelo_contrato.docx")
    try:
        sys.stdin.reconfigure(encoding="utf-8")
        data = json.load(sys.stdin)
        document = render(template, data)
        if "--preview" in sys.argv:
            payload = json.dumps({"paragraphs": paragraphs(document)}, ensure_ascii=False).encode("utf-8")
            sys.stdout.buffer.write(payload)
        else:
            sys.stdout.buffer.write(document)
        return 0
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
