import enum
import os
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, Path, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import (
    Column, Integer, String, Float, DateTime, Enum, ForeignKey, create_engine
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import declarative_base, sessionmaker, relationship, Session

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "mysql+pymysql://root:root@localhost:8889/bottle_management_db"
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class ActionTypeEnum(str, enum.Enum):
    New_Sale = "New_Sale"
    Exchange = "Exchange"
    Empty_Return = "Empty_Return"


class BottleType(Base):
    __tablename__ = "bottle_types"

    id = Column(Integer, primary_key=True, index=True)
    sku = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(150), nullable=False)
    category = Column(String(64), nullable=False, default="Water")
    image = Column(String(255), nullable=True, default="images/19l-water.svg")
    liquid_price = Column(Float, nullable=False)
    deposit_value = Column(Float, nullable=False)

    inventory = relationship(
        "Inventory", back_populates="bottle_type", uselist=False, cascade="all, delete-orphan"
    )


class Inventory(Base):
    __tablename__ = "inventory"

    bottle_type_id = Column(Integer, ForeignKey("bottle_types.id"), primary_key=True)
    full_qty = Column(Integer, nullable=False, default=0)
    empty_qty = Column(Integer, nullable=False, default=0)

    bottle_type = relationship("BottleType", back_populates="inventory")


class RegisterClosing(Base):
    __tablename__ = "register_closings"

    id = Column(Integer, primary_key=True, index=True)
    closed_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    closed_by = Column(String(100), nullable=False, default="Manager")
    opening_float = Column(Float, nullable=False, default=0.0)
    contents_sales = Column(Float, nullable=False, default=0.0)
    deposits_charged = Column(Float, nullable=False, default=0.0)
    deposit_refunds = Column(Float, nullable=False, default=0.0)
    net_sales = Column(Float, nullable=False, default=0.0)
    expected_cash = Column(Float, nullable=False, default=0.0)
    counted_cash = Column(Float, nullable=False, default=0.0)
    variance = Column(Float, nullable=False, default=0.0)
    tx_count = Column(Integer, nullable=False, default=0)


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    customer_id = Column(Integer, nullable=True)
    total_paid = Column(Float, nullable=False)
    closed_id = Column(Integer, ForeignKey("register_closings.id"), nullable=True)

    items = relationship(
        "TransactionItem", back_populates="transaction", cascade="all, delete-orphan"
    )


class TransactionItem(Base):
    __tablename__ = "transaction_items"

    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
    bottle_type_id = Column(Integer, ForeignKey("bottle_types.id"), nullable=False)
    action_type = Column(Enum(ActionTypeEnum), nullable=False)
    quantity = Column(Integer, nullable=False)
    deposit_logged = Column(Float, nullable=False)

    transaction = relationship("Transaction", back_populates="items")


class BottleCreateIn(BaseModel):
    sku: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=150)
    category: str = Field(default="Water", max_length=64)
    image: str | None = Field(default="images/19l-water.svg", max_length=255)
    liquid_price: float = Field(..., ge=0)
    deposit_value: float = Field(..., ge=0)
    full_qty: int = Field(default=0, ge=0)
    empty_qty: int = Field(default=0, ge=0)


class BottleUpdateIn(BaseModel):
    sku: str | None = Field(default=None, min_length=1, max_length=64)
    name: str | None = Field(default=None, min_length=1, max_length=150)
    category: str | None = Field(default=None, min_length=1, max_length=64)
    image: str | None = Field(default=None, max_length=255)
    liquid_price: float | None = Field(default=None, ge=0)
    deposit_value: float | None = Field(default=None, ge=0)
    full_qty: int | None = Field(default=None, ge=0)
    empty_qty: int | None = Field(default=None, ge=0)


class BottleOut(BaseModel):
    id: int
    sku: str
    name: str
    category: str
    image: str
    liquid_price: float
    deposit_value: float
    full_qty: int
    empty_qty: int


class TxItemIn(BaseModel):
    bottle_type_id: int
    action_type: ActionTypeEnum
    quantity: int = Field(..., gt=0)


class TxCreateIn(BaseModel):
    customer_id: int | None = None
    items: list[TxItemIn] = Field(..., min_length=1)


class TxItemOut(BaseModel):
    bottle_type_id: int
    name: str
    image: str
    action_type: ActionTypeEnum
    quantity: int
    liquid_price: float
    deposit_logged: float


class TxOut(BaseModel):
    id: int
    timestamp: str
    customer_id: int | str
    total_paid: float
    closed_id: int | None = None
    items: list[TxItemOut]


class ClosingCreateIn(BaseModel):
    closed_by: str = Field(default="Manager", max_length=100)
    opening_float: float = Field(default=0.0, ge=0)
    counted_cash: float = Field(..., ge=0)
    tx_ids: list[int] | None = None


class ClosingOut(BaseModel):
    id: int
    at: str
    by: str
    float_amount: float
    counted: float
    expected: float
    variance: float
    count: int
    contents_sales: float
    deposits_charged: float
    deposit_refunds: float
    net_sales: float
    tx_ids: list[int]


SEED_BOTTLES = [
    {"sku": "1001", "name": "19L Drinking Water Jug", "category": "Water", "image": "images/19l-water.svg", "liquid_price": 200.0, "deposit_value": 1500.0, "full_qty": 45, "empty_qty": 12},
    {"sku": "1002", "name": "5L Drinking Water Refill", "category": "Water", "image": "images/5l-water.svg", "liquid_price": 110.0, "deposit_value": 450.0, "full_qty": 30, "empty_qty": 8},
    {"sku": "2001", "name": "12.5kg Domestic Gas Cylinder", "category": "Gas", "image": "images/12kg-gas.svg", "liquid_price": 3650.0, "deposit_value": 8500.0, "full_qty": 18, "empty_qty": 14},
    {"sku": "2002", "name": "5kg Mini Gas Cylinder", "category": "Gas", "image": "images/5kg-gas.svg", "liquid_price": 1480.0, "deposit_value": 4200.0, "full_qty": 22, "empty_qty": 6},
    {"sku": "2003", "name": "2.3kg Camping Gas Cylinder", "category": "Gas", "image": "images/2kg-gas.svg", "liquid_price": 720.0, "deposit_value": 2800.0, "full_qty": 15, "empty_qty": 4},
    {"sku": "3001", "name": "1L Glass Soda Crate (12 Bottles)", "category": "Beverage", "image": "images/soda-crate.svg", "liquid_price": 1800.0, "deposit_value": 1200.0, "full_qty": 25, "empty_qty": 19},
    {"sku": "3002", "name": "500ml Ginger Beer Glass Bottle", "category": "Beverage", "image": "images/ginger-beer.svg", "liquid_price": 160.0, "deposit_value": 100.0, "full_qty": 120, "empty_qty": 64},
]


def seed_default_bottles(db: Session) -> None:
    inserted = False
    for item in SEED_BOTTLES:
        exists = db.query(BottleType).filter(BottleType.sku == item["sku"]).first()
        if exists:
            if not exists.inventory:
                db.add(Inventory(
                    bottle_type_id=exists.id,
                    full_qty=item["full_qty"],
                    empty_qty=item["empty_qty"],
                ))
                inserted = True
            continue

        bottle = BottleType(
            sku=item["sku"],
            name=item["name"],
            category=item["category"],
            image=item["image"],
            liquid_price=item["liquid_price"],
            deposit_value=item["deposit_value"],
        )
        db.add(bottle)
        db.flush()

        db.add(Inventory(
            bottle_type_id=bottle.id,
            full_qty=item["full_qty"],
            empty_qty=item["empty_qty"],
        ))
        inserted = True

    if inserted:
        db.commit()


def _serialize_bottle(bottle: BottleType, inv: Inventory | None) -> BottleOut:
    return BottleOut(
        id=bottle.id,
        sku=bottle.sku,
        name=bottle.name,
        category=bottle.category,
        image=bottle.image or "images/19l-water.svg",
        liquid_price=float(bottle.liquid_price),
        deposit_value=float(bottle.deposit_value),
        full_qty=int(inv.full_qty) if inv else 0,
        empty_qty=int(inv.empty_qty) if inv else 0,
    )


def _serialize_closing(rec: RegisterClosing, tx_ids: list[int]) -> ClosingOut:
    return ClosingOut(
        id=rec.id,
        at=rec.closed_at.strftime("%Y-%m-%d %H:%M:%S") if isinstance(rec.closed_at, datetime) else str(rec.closed_at),
        by=rec.closed_by,
        float_amount=float(rec.opening_float),
        counted=float(rec.counted_cash),
        expected=float(rec.expected_cash),
        variance=float(rec.variance),
        count=int(rec.tx_count),
        contents_sales=float(rec.contents_sales),
        deposits_charged=float(rec.deposits_charged),
        deposit_refunds=float(rec.deposit_refunds),
        net_sales=float(rec.net_sales),
        tx_ids=tx_ids,
    )


app = FastAPI(title="BottlePOS Retail API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_default_bottles(db)
    finally:
        db.close()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/bottles", response_model=list[BottleOut])
def list_bottles(db: Session = Depends(get_db)):
    rows = (
        db.query(BottleType, Inventory)
        .outerjoin(Inventory, BottleType.id == Inventory.bottle_type_id)
        .order_by(BottleType.id.asc())
        .all()
    )
    return [_serialize_bottle(bottle, inv) for bottle, inv in rows]


@app.post("/bottles", response_model=BottleOut, status_code=201)
def create_bottle(payload: BottleCreateIn, db: Session = Depends(get_db)):
    clean_sku = payload.sku.strip()
    if db.query(BottleType).filter(BottleType.sku == clean_sku).first():
        raise HTTPException(status_code=400, detail=f"SKU '{clean_sku}' already exists")

    try:
        bottle = BottleType(
            sku=clean_sku,
            name=payload.name.strip(),
            category=payload.category.strip() or "Water",
            image=(payload.image or "").strip() or "images/19l-water.svg",
            liquid_price=float(payload.liquid_price),
            deposit_value=float(payload.deposit_value),
        )
        db.add(bottle)
        db.flush()

        inv = Inventory(
            bottle_type_id=bottle.id,
            full_qty=int(payload.full_qty),
            empty_qty=int(payload.empty_qty),
        )
        db.add(inv)
        db.commit()
        db.refresh(bottle)
        db.refresh(inv)
        return _serialize_bottle(bottle, inv)
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc))


@app.put("/bottles/{bottle_id}", response_model=BottleOut)
def update_bottle(
    payload: BottleUpdateIn,
    bottle_id: int = Path(..., ge=1),
    db: Session = Depends(get_db),
):
    bottle = db.query(BottleType).filter(BottleType.id == bottle_id).first()
    if not bottle:
        raise HTTPException(status_code=404, detail=f"Bottle ID {bottle_id} not found")

    inv = db.query(Inventory).filter(Inventory.bottle_type_id == bottle_id).first()
    if not inv:
        inv = Inventory(bottle_type_id=bottle_id, full_qty=0, empty_qty=0)
        db.add(inv)

    try:
        if payload.sku is not None:
            clean_sku = payload.sku.strip()
            conflict = (
                db.query(BottleType)
                .filter(BottleType.sku == clean_sku, BottleType.id != bottle_id)
                .first()
            )
            if conflict:
                raise HTTPException(status_code=400, detail=f"SKU '{clean_sku}' is already used by another product")
            bottle.sku = clean_sku

        if payload.name is not None:
            bottle.name = payload.name.strip()
        if payload.category is not None:
            bottle.category = payload.category.strip() or bottle.category
        if payload.image is not None:
            bottle.image = payload.image.strip() or "images/19l-water.svg"
        if payload.liquid_price is not None:
            bottle.liquid_price = float(payload.liquid_price)
        if payload.deposit_value is not None:
            bottle.deposit_value = float(payload.deposit_value)

        if payload.full_qty is not None:
            inv.full_qty = int(payload.full_qty)
        if payload.empty_qty is not None:
            inv.empty_qty = int(payload.empty_qty)

        db.commit()
        db.refresh(bottle)
        db.refresh(inv)
        return _serialize_bottle(bottle, inv)
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Database constraint error while updating bottle")
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete("/bottles/{bottle_id}")
def delete_bottle_api(
    bottle_id: int = Path(..., ge=1),
    db: Session = Depends(get_db),
):
    bottle = db.query(BottleType).filter(BottleType.id == bottle_id).first()
    if not bottle:
        raise HTTPException(status_code=404, detail=f"Bottle ID {bottle_id} not found")

    try:
        db.query(TransactionItem).filter(TransactionItem.bottle_type_id == bottle_id).delete(synchronize_session=False)
        db.delete(bottle)
        db.commit()
        return {"deleted": True, "id": bottle_id}
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/transactions", response_model=list[TxOut])
def list_transactions(limit: int = Query(default=100, ge=1, le=500), db: Session = Depends(get_db)):
    bottle_map = {b.id: b for b in db.query(BottleType).all()}
    txs = db.query(Transaction).order_by(Transaction.id.desc()).limit(limit).all()

    result: list[TxOut] = []
    for tx in txs:
        items_out: list[TxItemOut] = []
        for item in tx.items:
            b = bottle_map.get(item.bottle_type_id)
            items_out.append(TxItemOut(
                bottle_type_id=item.bottle_type_id,
                name=b.name if b else f"Bottle #{item.bottle_type_id}",
                image=(b.image if b and b.image else "images/19l-water.svg"),
                action_type=item.action_type,
                quantity=int(item.quantity),
                liquid_price=float(b.liquid_price) if b else 0.0,
                deposit_logged=float(item.deposit_logged),
            ))

        result.append(TxOut(
            id=tx.id,
            timestamp=tx.timestamp.strftime("%Y-%m-%d %H:%M:%S") if isinstance(tx.timestamp, datetime) else str(tx.timestamp),
            customer_id=tx.customer_id if tx.customer_id is not None else "Walk-in",
            total_paid=float(tx.total_paid),
            closed_id=tx.closed_id,
            items=items_out,
        ))
    return result


@app.post("/transactions/")
def create_transaction(payload: TxCreateIn, db: Session = Depends(get_db)):
    try:
        net_total = 0.0
        tx = Transaction(customer_id=payload.customer_id, total_paid=0.0)
        db.add(tx)
        db.flush()

        for row in payload.items:
            bottle = db.query(BottleType).filter(BottleType.id == row.bottle_type_id).first()
            inv = db.query(Inventory).filter(Inventory.bottle_type_id == row.bottle_type_id).first()
            if not bottle or not inv:
                raise HTTPException(status_code=404, detail=f"Bottle ID {row.bottle_type_id} not found")

            locked_deposit = float(bottle.deposit_value)
            liquid_price = float(bottle.liquid_price)

            if row.action_type == ActionTypeEnum.New_Sale:
                if inv.full_qty < row.quantity:
                    raise HTTPException(status_code=400, detail=f"Insufficient full stock for {bottle.name}")
                inv.full_qty -= row.quantity
                net_total += (liquid_price + locked_deposit) * row.quantity
            elif row.action_type == ActionTypeEnum.Exchange:
                if inv.full_qty < row.quantity:
                    raise HTTPException(status_code=400, detail=f"Insufficient full stock for {bottle.name}")
                inv.full_qty -= row.quantity
                inv.empty_qty += row.quantity
                net_total += liquid_price * row.quantity
            elif row.action_type == ActionTypeEnum.Empty_Return:
                inv.empty_qty += row.quantity
                net_total -= locked_deposit * row.quantity

            db.add(TransactionItem(
                transaction_id=tx.id,
                bottle_type_id=bottle.id,
                action_type=row.action_type,
                quantity=row.quantity,
                deposit_logged=locked_deposit,
            ))

        tx.total_paid = round(net_total, 2)
        db.commit()
        db.refresh(tx)
        return {"id": tx.id, "total_paid": tx.total_paid}
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/closings", response_model=list[ClosingOut])
def list_closings(limit: int = Query(default=50, ge=1, le=200), db: Session = Depends(get_db)):
    records = db.query(RegisterClosing).order_by(RegisterClosing.id.desc()).limit(limit).all()
    out: list[ClosingOut] = []
    for rec in records:
        tx_ids = [t.id for t in db.query(Transaction.id).filter(Transaction.closed_id == rec.id).all()]
        out.append(_serialize_closing(rec, tx_ids))
    return out


@app.post("/closings/", response_model=ClosingOut, status_code=201)
def create_closing(payload: ClosingCreateIn, db: Session = Depends(get_db)):
    query = db.query(Transaction).filter(Transaction.closed_id.is_(None))
    if payload.tx_ids:
        query = query.filter(Transaction.id.in_(payload.tx_ids))

    open_txs = query.order_by(Transaction.id.asc()).all()
    if not open_txs:
        raise HTTPException(status_code=400, detail="No open transactions available to close")

    bottle_map = {b.id: b for b in db.query(BottleType).all()}
    liq_total = 0.0
    dep_in = 0.0
    dep_out = 0.0

    for tx in open_txs:
        for item in tx.items:
            b = bottle_map.get(item.bottle_type_id)
            liq_price = float(b.liquid_price) if b else 0.0
            dep_val = float(item.deposit_logged)
            if item.action_type == ActionTypeEnum.New_Sale:
                liq_total += liq_price * item.quantity
                dep_in += dep_val * item.quantity
            elif item.action_type == ActionTypeEnum.Exchange:
                liq_total += liq_price * item.quantity
            elif item.action_type == ActionTypeEnum.Empty_Return:
                dep_out += dep_val * item.quantity

    net_sales = round(liq_total + dep_in - dep_out, 2)
    opening_float = round(float(payload.opening_float), 2)
    counted_cash = round(float(payload.counted_cash), 2)
    expected_cash = round(opening_float + net_sales, 2)
    variance = round(counted_cash - expected_cash, 2)

    try:
        closing = RegisterClosing(
            closed_by=(payload.closed_by or "Manager").strip(),
            opening_float=opening_float,
            contents_sales=round(liq_total, 2),
            deposits_charged=round(dep_in, 2),
            deposit_refunds=round(dep_out, 2),
            net_sales=net_sales,
            expected_cash=expected_cash,
            counted_cash=counted_cash,
            variance=variance,
            tx_count=len(open_txs),
        )
        db.add(closing)
        db.flush()

        tx_ids = []
        for tx in open_txs:
            tx.closed_id = closing.id
            tx_ids.append(tx.id)

        db.commit()
        db.refresh(closing)
        return _serialize_closing(closing, tx_ids)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc))
