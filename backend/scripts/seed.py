"""Seed fictional demo books once; never overwrite administrator edits."""
from sqlalchemy.orm import Session
from app.database import get_engine
from app.models import Book

BOOKS = [
    ("The Art of Noticing", "Mira Ellison", "Essays", "A field guide to paying attention. Small observations become expansive essays about the places, people, and rituals we too often walk past.", 2400, "#a54f36", 2025, True),
    ("A Place Between", "Jonah Reed", "Fiction", "Two strangers inherit the same seaside house. As seasons turn, their unlikely friendship becomes a story about belonging, memory, and starting again.", 1800, "#245947", 2024, True),
    ("Ordinary Light", "Ada Marin", "Poetry", "Quiet poems for the hours between things. A collection about kitchen windows, winter mornings, and the extraordinary tenderness of ordinary life.", 1600, "#d5ad52", 2025, False),
    ("Forms of Living", "Theo Nakamura", "Design", "A thoughtful exploration of objects we live with, from a well-worn chair to the shape of a city. Design as a practice of care, rather than consumption.", 3200, "#536a86", 2023, True),
    ("The Blue Hours", "Sofia Laurent", "Fiction", "A photographer returns to her childhood town to document its final summer before a reservoir changes everything. An intimate novel about what we choose to preserve.", 2200, "#41476d", 2025, False),
    ("An Atlas of Small Things", "Elias Moss", "Science", "Follow the hidden systems inside a leaf, a drop of water, and a handful of soil. An accessible invitation to the science happening all around us.", 2600, "#68754a", 2024, False),
    ("Walking Home", "Nora Fields", "Essays", "Twelve walks, twelve meditations on place. A writer traces the streets that shaped her, discovering that getting lost can be its own kind of arrival.", 2000, "#b26e55", 2022, False),
    ("Still, We Grow", "Imani Cole", "Poetry", "A generous collection on change, resilience, and the slow work of becoming. Poems that leave room for both grief and possibility.", 1700, "#8b6d80", 2025, False),
    ("The Shape of Silence", "Lucien Park", "Design", "An illustrated-in-spirit study of negative space, proportion, and restraint. Learn how thoughtful absence gives meaning to what remains.", 2900, "#7f6252", 2024, False),
    ("Where Rivers Begin", "Amara Vale", "Science", "From mountain springs to the open sea, discover how rivers sustain ecosystems and communities. A compelling introduction to the living world of water.", 2300, "#337f87", 2023, False),
    ("Letters from Elsewhere", "Felix Arden", "Fiction", "A box of undelivered letters brings a retired postman into the lives of people he has never met. A warm story of missed connections and second chances.", 1900, "#a47d31", 2024, False),
    ("On Slow Sundays", "Lena Hart", "Essays", "Notes on making room for rest, friendship, and unhurried meals. A gentle argument for days that do not need to prove their usefulness.", 2100, "#59756c", 2025, False),
]


def main(connection=None):
    with Session(connection if connection is not None else get_engine()) as db:
        added = 0
        for i, (title, author, category, description, price, color, year, featured) in enumerate(BOOKS, 1):
            book_id = f"demo-{i:02}"
            if not db.get(Book, book_id):
                db.add(Book(id=book_id, title=title, author=author, category=category, description=description, price_cents=price, stock=12 + i * 3, cover_color=color, published_year=year, featured=featured))
                added += 1
        db.commit()
        print(f"Added {added} fictional demo books.")


if __name__ == "__main__":
    main()
