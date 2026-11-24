"""Verify the 16 KiB ZIP and 64-bit ELF alignment of both Android packaging paths."""

import io
import json
import struct
import sys
from pathlib import Path
from zipfile import ZIP_STORED, ZipFile

PAGE_SIZE = 16384
EXPECTED_ABIS = {"arm64-v8a", "armeabi-v7a", "x86_64", "x86"}
ABIS_64_BIT = {"arm64-v8a", "x86_64"}


def zip_data_offset(archive, entry):
    archive.fp.seek(entry.header_offset)
    header = archive.fp.read(30)
    if not header.startswith(b"PK\x03\x04"):
        raise ValueError(f"Invalid local ZIP entry for {entry.filename}")
    name_size, extra_size = struct.unpack_from("<HH", header, 26)
    return entry.header_offset + 30 + name_size + extra_size


def verify_elf(payload, name):
    if not payload.startswith(b"\x7fELF\x02\x01"):
        raise ValueError(f"{name} is not a little-endian 64-bit ELF")
    header = struct.unpack_from("<16sHHIQQQIHHHHHH", payload)
    program_start, entry_size, entry_count = header[5], header[9], header[10]
    segments = []
    for number in range(entry_count):
        program = struct.unpack_from("<IIQQQQQQ", payload, program_start + entry_size * number)
        if program[0] != 1:
            continue
        _, _, file_offset, virtual_address, _, _, _, alignment = program
        if alignment < PAGE_SIZE or (file_offset - virtual_address) % PAGE_SIZE:
            raise ValueError(f"{name} has a non-16 KiB ELF LOAD segment")
        segments.append(alignment)
    if not segments:
        raise ValueError(f"{name} is missing ELF LOAD segments")
    return segments


def verify_apk(archive, apk_name):
    results = []
    for entry in archive.infolist():
        parts = entry.filename.split("/")
        if len(parts) != 3 or parts[0] != "lib" or not parts[2].endswith(".so"):
            continue
        _, abi, name = parts
        if entry.compress_type != ZIP_STORED or zip_data_offset(archive, entry) % PAGE_SIZE:
            raise ValueError(f"{apk_name}: {entry.filename} is not stored at a 16 KiB ZIP boundary")
        elf_alignment = verify_elf(archive.read(entry), entry.filename) if abi in ABIS_64_BIT else []
        results.append({
            "apk": apk_name,
            "abi": abi,
            "library": name,
            "zipAlignment": PAGE_SIZE,
            "elfLoadAlignment": elf_alignment,
        })
    return results


def require_abis(results, source):
    if {entry["abi"] for entry in results} != EXPECTED_ABIS:
        raise ValueError(f"{source} does not include the expected Android ABIs")


def main(apk_path, apks_path):
    with ZipFile(apk_path) as archive:
        apk_results = verify_apk(archive, Path(apk_path).name)
    split_results = []
    with ZipFile(apks_path) as split_set:
        for name in split_set.namelist():
            if name.endswith(".apk"):
                with ZipFile(io.BytesIO(split_set.read(name))) as archive:
                    split_results.extend(verify_apk(archive, name))
    require_abis(apk_results, "Signed APK")
    require_abis(split_results, "Bundletool-generated APKs")
    print(json.dumps({"apk": apk_results, "bundletoolApks": split_results}, indent=2))


if __name__ == "__main__":
    main(*sys.argv[1:])
