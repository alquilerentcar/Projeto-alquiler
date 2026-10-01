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


def filled_blocks(data):
    result = []
    for block in data.get("modelo_blocos") or []:
        text, styles = "", []
        for run in block.get("runs", []):
            value = str(run.get("text", ""))
            text += value
            styles.extend([run] * len(value))
        runs, pos = [], 0
        def append_range(start, end):
            for index in range(start, end):
                runs.append({**styles[index], "text": text[index]})
        for marker in re.finditer(r"\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}", text):
            append_range(pos, marker.start())
            runs.append({**styles[marker.start()], "text": clean(data.get(marker.group(1), ""))})
            pos = marker.end()
        append_range(pos, len(text))
        # Merge neighbouring runs to keep Word and PDF output compact.
        merged = []
        for run in runs:
            if merged and {k:v for k,v in merged[-1].items() if k!='text'} == {k:v for k,v in run.items() if k!='text'}:
                merged[-1]['text'] += run['text']
            else:
                merged.append(run.copy())
        result.append({"align": block.get("align", "left"), "runs": merged})
    return result


def rich_xml(data):
    body = []
    for block in filled_blocks(data):
        align = {"left":"left", "center":"center", "right":"right", "justify":"both"}.get(block['align'], 'left')
        runs = []
        for run in block['runs']:
            props = ''.join(tag for flag,tag in [('bold','<w:b/>'),('italic','<w:i/>'),('underline','<w:u w:val="single"/>')] if run.get(flag))
            size = int(min(24,max(8,float(run.get('size') or 12)))*2)
            runs.append(f'<w:r><w:rPr>{props}<w:sz w:val="{size}"/></w:rPr><w:t xml:space="preserve">{replacement(run["text"])}</w:t></w:r>')
        body.append(f'<w:p><w:pPr><w:jc w:val="{align}"/></w:pPr>{"".join(runs)}</w:p>')
    return ('<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+''.join(body)+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="2280" w:right="1140" w:bottom="1140" w:left="1700"/></w:sectPr></w:body></w:document>').encode('utf-8')


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
            if item.filename == "word/document.xml" and data.get("modelo_blocos"):
                zout.writestr(item, rich_xml(data))
                continue
            if item.filename.endswith(".xml"):
                text = content.decode("utf-8")
                text = re.sub(r"Alquiler Rent a Car(?: LTDA\.?)?", "{{ empresa_razao_social }}", text, flags=re.I)
                text = re.sub(r"Alquiler", "{{ empresa_razao_social }}", text, flags=re.I)
                if item.filename == "word/document.xml":
                    def lessor_paragraph(match):
                        paragraph = match.group(0)
                        plain = re.sub(r"<[^>]+>", "", paragraph)
                        if plain.strip().startswith("LOCADORA:"):
                            identity = "LOCADORA: {{ empresa_razao_social }}, inscrita no CNPJ nº {{ empresa_cnpj }}, com sede em {{ empresa_endereco }}, e-mail {{ empresa_email }}, telefone {{ empresa_telefone }}, doravante denominada LOCADORA."
                            return "<w:p><w:r><w:t>" + identity + "</w:t></w:r></w:p>"
                        return paragraph
                    text = re.sub(r"<w:p[ >].*?</w:p>", lessor_paragraph, text, flags=re.S)
                text = text.replace("R${{ multa_atraso_diaria }}", "{{ multa_atraso_diaria }}")
                text = text.replace("ASSINATURA DO LOCADOR", "ASSINATURA DO LOCADOR</w:t><w:br/><w:t>{{ empresa_razao_social }}")
                text = text.replace("ASSINATURA DA LOCADORA", "ASSINATURA DA LOCADORA</w:t><w:br/><w:t>{{ empresa_razao_social }}")
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
            payload = json.dumps({"paragraphs": paragraphs(document), "formatacao": filled_blocks(data), "modelo_versao": data.get("modelo_versao")}, ensure_ascii=False).encode("utf-8")
            sys.stdout.buffer.write(payload)
        else:
            sys.stdout.buffer.write(document)
        return 0
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
